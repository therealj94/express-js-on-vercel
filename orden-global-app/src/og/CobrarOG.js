// Cobrar con QR, nativo: escribes el monto y aparece el código. Quien lo
// escanea con su app Orden Global cae en la pantalla de ENVIAR ya preparada
// --tu dirección, el monto--, y firma con su dedo. Un código, un pago.
import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { C } from '../theme';
import { Header, useAccount } from '../ui';
import { useLang } from '../i18n';
import { aUri } from './rutas';

const TXT = {
  es: { titulo: 'Cobrar', monto: 'MONTO EN ORIGEN', nota: 'Quien escanee este código con Orden Global verá el envío preparado hacia tu billetera. Lo firma en su teléfono.', sin: 'Escribe el monto y aparece el código.' },
  en: { titulo: 'Charge', monto: 'AMOUNT IN ORIGEN', nota: 'Whoever scans this code with Orden Global will see the send prepared towards your wallet. They sign it on their phone.', sin: 'Type the amount and the code appears.' },
};

export default function CobrarOG({ nav }) {
  const { lang } = useLang();
  const t = TXT[lang] || TXT.es;
  const { account } = useAccount();
  const [monto, setMonto] = useState('');
  const limpio = monto.replace(',', '.').replace(/[^0-9.]/g, '');
  const valido = /^\d+(\.\d{1,2})?$/.test(limpio) && Number(limpio) > 0 && account?.addr;
  return (
    <View style={st.screen}>
      <Header title={t.titulo} onBack={nav.back} />
      <ScrollView contentContainerStyle={st.dentro}>
        <Text style={st.eti}>{t.monto}</Text>
        <TextInput value={monto} onChangeText={setMonto} keyboardType="decimal-pad"
          placeholder="0.00" placeholderTextColor={C.txt3} style={st.input} />
        {valido ? (
          <View style={st.qrCaja}>
            <View style={st.qrBlanco}>
              <QRCode value={aUri('wallet/enviar', { to: account.addr, amount: limpio })}
                size={230} color="#04211d" backgroundColor="#ffffff" ecl="M" />
            </View>
            <Text style={st.grande}>{limpio} <Text style={st.moneda}>ORIGEN</Text></Text>
            <Text style={st.nota}>{t.nota}</Text>
          </View>
        ) : <Text style={st.nota}>{t.sin}</Text>}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1 },
  dentro: { padding: 20, alignItems: 'center' },
  eti: { color: C.txt3, fontSize: 10, fontWeight: '700', letterSpacing: 3, alignSelf: 'flex-start', marginBottom: 8 },
  input: { alignSelf: 'stretch', backgroundColor: C.input, borderWidth: 1, borderColor: C.inputBr, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, color: C.txt, fontSize: 26, textAlign: 'center', marginBottom: 18 },
  qrCaja: { alignItems: 'center' },
  qrBlanco: { backgroundColor: '#fff', padding: 16, borderRadius: 18 },
  grande: { color: C.txt, fontSize: 26, fontWeight: '200', marginTop: 14 },
  moneda: { fontSize: 14, color: C.gold, fontWeight: '700' },
  nota: { color: C.txt2, fontSize: 12.5, lineHeight: 19, textAlign: 'center', marginTop: 10, maxWidth: 280 },
});
