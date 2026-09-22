# Fixtures sintéticos

Todo lo que hay en esta carpeta está **inventado a propósito** y así está
marcado en cada archivo con el campo `"sintetico": true`.

Reglas:

1. **Ningún dato real entra aquí.** Ni direcciones del ecosistema, ni cuentas,
   ni saldos, ni referencias de identidad, ni documentos, ni hashes de nada que
   exista. Las direcciones son secuencias construidas que no corresponden a
   ninguna cuenta.
2. **Ningún valor económico aprobado.** Los porcentajes, precios y quórums de
   los fixtures existen para que una prueba pueda correr, y no son una propuesta
   ni un valor por defecto. El código de producción los lee de
   `DECISIONES-SFSP.json`, donde están en `null`.
3. **Un fixture no es evidencia.** Que una prueba pase con estos datos acredita
   que la lógica hace lo que dice con estos datos. No acredita nada sobre la red,
   los contratos desplegados ni las cuentas de nadie.

| Archivo | Para qué |
|---|---|
| `censo-sintetico.json` | Migración de cuentas: N cuentas de origen con dirección y saldos. |
| `pasaportes-sinteticos.json` | Un activo de cada perfil de implementación. |
| `reservas-sinteticas.json` | Cartera de reservas de los cinco tiers, con factores de prueba. |
| `autorizacion-sintetica.json` | Una autorización firmada con todos sus campos. |
| `vectores-autorizacion.json` | Veinte payloads con su digest esperado, para comprobar que Solidity y TypeScript calculan lo mismo. |

Una suite del SDK abre los cinco archivos, los valida contra los tipos y los
usa en un recorrido real. Antes no los abría ninguna, y eso hacía parecer la
cobertura mayor de lo que era.
