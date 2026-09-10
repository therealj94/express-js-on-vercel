// Vuelca el árbol de estado COMPLETO de un nodo polygon-edge.
//
// POR QUE EXISTE ESTE PROGRAMA
//
// El plan original leía el estado por RPC: unas ranuras fijas por contrato y
// el mapa de saldos detectado a tientas. Eso funciona para un ERC-20 sencillo
// y falla para todo lo demás — y la cadena resultó tener ~110 contratos, entre
// ellos pares de un AMM cuyo estado no cabe en «veinte ranuras y un mapping».
// El RPC público además no expone NINGUNA forma de enumerar almacenamiento:
// debug_storageRangeAt, debug_accountRange, debug_dumpBlock y eth_getProof
// están todos ausentes.
//
// La única fuente completa es el propio árbol de Merkle-Patricia del nodo. Son
// 5,3 MB: se recorre entero en segundos.
//
// LO QUE EL ARBOL NO TRAE, Y COMO SE RESUELVE
//
// Las claves del árbol son keccak(dirección) y keccak(ranura); las preimágenes
// no se guardan. Este programa emite los HASHES con sus valores. Emparejarlos
// con direcciones y ranuras reales se hace después (emparejar-preimagenes.py)
// probando candidatos conocidos. Lo importante: al emitir TODAS las hojas, lo
// que no se logre emparejar queda CONTADO, no ignorado. La diferencia entre
// «cuadra al 100 %» y «creemos que cuadra» es exactamente esa cuenta.
//
// USO
//
//	go run volcar-estado.go -trie /home/ec2-user/node-3/trie \
//	    -raiz 0x<stateRoot> -salida estado.json
//
// El stateRoot se saca del bloque de referencia:
//	curl -s -X POST $RPC -d '{"jsonrpc":"2.0","id":1,"method":"eth_getBlockByNumber","params":["0x...",false]}'

package main

import (
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"math/big"
	"os"

	"github.com/syndtr/goleveldb/leveldb"
	"github.com/syndtr/goleveldb/leveldb/opt"
)

// ── RLP: decodificador mínimo, sólo lo que hace falta para leer nodos ────────

type item struct {
	esLista bool
	bytes   []byte
	lista   []item
}

func decodificar(b []byte) (item, []byte, error) {
	if len(b) == 0 {
		return item{}, nil, fmt.Errorf("RLP vacío")
	}
	p := b[0]
	switch {
	case p < 0x80:
		return item{bytes: b[:1]}, b[1:], nil
	case p < 0xb8:
		n := int(p - 0x80)
		if len(b) < 1+n {
			return item{}, nil, fmt.Errorf("cadena corta")
		}
		return item{bytes: b[1 : 1+n]}, b[1+n:], nil
	case p < 0xc0:
		l := int(p - 0xb7)
		if len(b) < 1+l {
			return item{}, nil, fmt.Errorf("longitud corta")
		}
		n := int(new(big.Int).SetBytes(b[1 : 1+l]).Int64())
		if len(b) < 1+l+n {
			return item{}, nil, fmt.Errorf("cadena larga corta")
		}
		return item{bytes: b[1+l : 1+l+n]}, b[1+l+n:], nil
	case p < 0xf8:
		n := int(p - 0xc0)
		if len(b) < 1+n {
			return item{}, nil, fmt.Errorf("lista corta")
		}
		hijos, err := decodificarLista(b[1 : 1+n])
		return item{esLista: true, lista: hijos}, b[1+n:], err
	default:
		l := int(p - 0xf7)
		if len(b) < 1+l {
			return item{}, nil, fmt.Errorf("longitud de lista corta")
		}
		n := int(new(big.Int).SetBytes(b[1 : 1+l]).Int64())
		if len(b) < 1+l+n {
			return item{}, nil, fmt.Errorf("lista larga corta")
		}
		hijos, err := decodificarLista(b[1+l : 1+l+n])
		return item{esLista: true, lista: hijos}, b[1+l+n:], err
	}
}

func decodificarLista(b []byte) ([]item, error) {
	var out []item
	for len(b) > 0 {
		var it item
		var err error
		it, b, err = decodificar(b)
		if err != nil {
			return out, err
		}
		out = append(out, it)
	}
	return out, nil
}

// ── El recorrido del árbol ───────────────────────────────────────────────────

type recorrido struct {
	db      *leveldb.DB
	hojas   func(camino []byte, valor []byte)
	nodos   int
	fallos  int
	faltan  int // referencias a nodos que no están en la base
}

// nibbles: el camino se acumula en medios-bytes; al llegar a la hoja se
// recompone la clave de 32 bytes (keccak de la dirección o de la ranura).
func compacto(b []byte) (nibbles []byte, esHoja bool) {
	if len(b) == 0 {
		return nil, false
	}
	bandera := b[0] >> 4
	esHoja = bandera >= 2
	impar := bandera%2 == 1
	if impar {
		nibbles = append(nibbles, b[0]&0x0f)
	}
	for _, x := range b[1:] {
		nibbles = append(nibbles, x>>4, x&0x0f)
	}
	return nibbles, esHoja
}

func (r *recorrido) nodo(ref item, camino []byte) {
	var crudo []byte
	if ref.esLista {
		// nodo empotrado (menos de 32 bytes): ya lo tenemos decodificado
		r.rama(ref, camino)
		return
	}
	if len(ref.bytes) == 0 {
		return
	}
	if len(ref.bytes) != 32 {
		return
	}
	v, err := r.db.Get(ref.bytes, nil)
	if err != nil {
		r.faltan++
		return
	}
	crudo = v
	it, _, err := decodificar(crudo)
	if err != nil {
		r.fallos++
		return
	}
	r.rama(it, camino)
}

func (r *recorrido) rama(it item, camino []byte) {
	r.nodos++
	if !it.esLista {
		return
	}
	switch len(it.lista) {
	case 17:
		for i := 0; i < 16; i++ {
			h := it.lista[i]
			if h.esLista || len(h.bytes) > 0 {
				r.nodo(h, append(append([]byte{}, camino...), byte(i)))
			}
		}
		if len(it.lista[16].bytes) > 0 {
			r.hojas(camino, it.lista[16].bytes)
		}
	case 2:
		nib, esHoja := compacto(it.lista[0].bytes)
		nuevo := append(append([]byte{}, camino...), nib...)
		if esHoja {
			r.hojas(nuevo, it.lista[1].bytes)
		} else {
			r.nodo(it.lista[1], nuevo)
		}
	}
}

func clave(nibbles []byte) string {
	b := make([]byte, 0, len(nibbles)/2)
	for i := 0; i+1 < len(nibbles); i += 2 {
		b = append(b, nibbles[i]<<4|nibbles[i+1])
	}
	return "0x" + hex.EncodeToString(b)
}

// ── Salida ───────────────────────────────────────────────────────────────────

type cuenta struct {
	HashDireccion string            `json:"hashDireccion"`
	Nonce         uint64            `json:"nonce"`
	Saldo         string            `json:"saldo"`
	RaizAlmacen   string            `json:"raizAlmacen"`
	HashCodigo    string            `json:"hashCodigo"`
	Codigo        string            `json:"codigo,omitempty"`
	Almacen       map[string]string `json:"almacen,omitempty"` // keccak(ranura) -> valor
}

const raizVacia = "0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421"
const codigoVacio = "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"

func main() {
	trie := flag.String("trie", "", "carpeta trie del nodo (leveldb)")
	raiz := flag.String("raiz", "", "stateRoot del bloque de referencia (0x…)")
	salida := flag.String("salida", "estado.json", "archivo de salida")
	flag.Parse()
	if *trie == "" || *raiz == "" {
		fmt.Fprintln(os.Stderr, "faltan -trie y -raiz")
		os.Exit(2)
	}

	db, err := leveldb.OpenFile(*trie, &opt.Options{ReadOnly: true})
	if err != nil {
		fmt.Fprintln(os.Stderr, "no se pudo abrir el leveldb:", err)
		os.Exit(1)
	}
	defer db.Close()

	raizB, err := hex.DecodeString((*raiz)[2:])
	if err != nil {
		fmt.Fprintln(os.Stderr, "raíz inválida:", err)
		os.Exit(1)
	}

	cuentas := []cuenta{}
	rc := &recorrido{db: db}
	rc.hojas = func(camino []byte, valor []byte) {
		it, _, err := decodificar(valor)
		if err != nil || !it.esLista || len(it.lista) != 4 {
			rc.fallos++
			return
		}
		c := cuenta{
			HashDireccion: clave(camino),
			Nonce:         new(big.Int).SetBytes(it.lista[0].bytes).Uint64(),
			Saldo:         new(big.Int).SetBytes(it.lista[1].bytes).String(),
			RaizAlmacen:   "0x" + hex.EncodeToString(it.lista[2].bytes),
			HashCodigo:    "0x" + hex.EncodeToString(it.lista[3].bytes),
		}
		if c.HashCodigo != codigoVacio {
			if code, err := db.Get(append([]byte("code"), it.lista[3].bytes...), nil); err == nil {
				c.Codigo = "0x" + hex.EncodeToString(code)
			}
		}
		if c.RaizAlmacen != raizVacia && c.RaizAlmacen != "0x" {
			c.Almacen = map[string]string{}
			ra := &recorrido{db: db}
			ra.hojas = func(cam []byte, val []byte) {
				v, _, err := decodificar(val)
				if err != nil {
					ra.fallos++
					return
				}
				c.Almacen[clave(cam)] = "0x" + hex.EncodeToString(v.bytes)
			}
			rr, _ := hex.DecodeString(c.RaizAlmacen[2:])
			ra.nodo(item{bytes: rr}, nil)
			rc.fallos += ra.fallos
			rc.faltan += ra.faltan
		}
		cuentas = append(cuentas, c)
	}
	rc.nodo(item{bytes: raizB}, nil)

	f, _ := os.Create(*salida)
	defer f.Close()
	enc := json.NewEncoder(f)
	enc.SetIndent("", " ")
	total := 0
	conCodigo := 0
	for _, c := range cuentas {
		total += len(c.Almacen)
		if c.Codigo != "" {
			conCodigo++
		}
	}
	_ = enc.Encode(map[string]any{
		"raiz":            *raiz,
		"cuentas":         cuentas,
		"nodosVisitados":  rc.nodos,
		"nodosQueFaltan":  rc.faltan,
		"nodosIlegibles":  rc.fallos,
		"ranurasTotales":  total,
		"cuentasConCodigo": conCodigo,
	})
	fmt.Printf("cuentas: %d · con código: %d · ranuras de almacenamiento: %d\n", len(cuentas), conCodigo, total)
	fmt.Printf("nodos visitados: %d · que faltan en la base: %d · ilegibles: %d\n", rc.nodos, rc.faltan, rc.fallos)
	if rc.faltan > 0 || rc.fallos > 0 {
		fmt.Println("AVISO: el volcado NO está completo. No se construye génesis con esto.")
		os.Exit(3)
	}
}
