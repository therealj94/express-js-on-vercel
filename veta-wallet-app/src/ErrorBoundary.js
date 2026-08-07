import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Icon } from './icons';
import { C } from './theme';
import { Logo } from './ui';
import { fallo } from './telemetria';

// Red de seguridad global. Sin esto, un error en cualquier pantalla dejaba
// la app en blanco sin manera de recuperar. Ahora se muestra una tarjeta
// con el mensaje, opción de reintentar, y el fallo se reporta a la analítica
// de Genesis ID con la pila de componentes. En tiendas, un crash sin captura
// es motivo habitual de rechazo en la revisión.
export default class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null, info: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    // Un fallo que llega hasta aquí ya dejó a alguien mirando una pantalla
    // rota, así que se reporta como crítico y con la pila de componentes: sin
    // ella, «Cannot read property of undefined» no dice en qué pantalla pasó.
    // El reporte nunca lanza — si Genesis ID está caído, esto no hace nada.
    try {
      fallo(error, {
        nombre: 'pantalla-rota',
        gravedad: 'critico',
        meta: { componentes: String(info?.componentStack || '').slice(0, 400) },
      });
    } catch (e) { /* jamás empeorar un fallo intentando reportarlo */ }

    if (typeof console !== 'undefined' && console.error) {
      console.error('[ErrorBoundary]', error, info && info.componentStack);
    }
  }

  reset = () => this.setState({ hasError: false, error: null, info: null });

  render() {
    if (!this.state.hasError) return this.props.children;
    const msg = (this.state.error && (this.state.error.message || String(this.state.error))) || 'Error desconocido';
    return (
      <View style={styles.bg}>
        <ScrollView contentContainerStyle={styles.wrap}>
          <Logo size={72} />
          <View style={styles.iconBox}>
            <Icon name="alert-circle" size={38} color={C.gold} />
          </View>
          <Text style={styles.title}>Algo salió mal</Text>
          <Text style={styles.p}>
            La app se topó con un problema inesperado. Ya está guardado para revisarlo.
            Puedes reintentar; si vuelve a pasar, cerrá y volvé a abrir la app.
          </Text>
          <View style={styles.detail}>
            <Text style={styles.detailLbl}>Detalle</Text>
            <Text style={styles.detailTxt} numberOfLines={4}>{msg}</Text>
          </View>
          <Pressable onPress={this.reset} style={styles.btn}>
            <Icon name="refresh" size={18} color={C.darkText} />
            <Text style={styles.btnTxt}>Reintentar</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: C.bg },
  wrap: { padding: 30, paddingTop: 90, alignItems: 'center', minHeight: '100%' },
  iconBox: {
    width: 84, height: 84, borderRadius: 26,
    backgroundColor: 'rgba(201,169,97,0.12)',
    alignItems: 'center', justifyContent: 'center',
    marginTop: 26, marginBottom: 18,
  },
  title: { color: C.txt, fontWeight: '800', fontSize: 22, marginBottom: 10, textAlign: 'center' },
  p: { color: C.txt2, fontSize: 13.5, lineHeight: 20, textAlign: 'center', maxWidth: 320, marginBottom: 22 },
  detail: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: C.line, borderWidth: 1, borderRadius: 14,
    padding: 14, marginBottom: 24,
  },
  detailLbl: { color: C.txt3, fontSize: 10.5, letterSpacing: 2, fontWeight: '700', marginBottom: 6 },
  detailTxt: { color: C.txt, fontFamily: 'Courier', fontSize: 12, lineHeight: 17 },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.gold, paddingHorizontal: 22, paddingVertical: 13,
    borderRadius: 14,
  },
  btnTxt: { color: C.darkText, fontWeight: '800', fontSize: 14.5 },
});
