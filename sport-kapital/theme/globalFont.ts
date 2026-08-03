// theme/globalFont.ts
// Aplica JetBrains Mono como tipografía base de TODA la app sin tocar cada
// pantalla: se importa una sola vez (efecto de módulo) desde el layout raíz,
// después de que las fuentes ya están cargadas con useFonts.
import { Text, TextInput } from 'react-native';
import { font } from './tokens';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AnyText = Text as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AnyTextInput = TextInput as any;

AnyText.defaultProps = AnyText.defaultProps || {};
AnyText.defaultProps.style = [{ fontFamily: font.family.body }, AnyText.defaultProps.style];

AnyTextInput.defaultProps = AnyTextInput.defaultProps || {};
AnyTextInput.defaultProps.style = [{ fontFamily: font.family.body }, AnyTextInput.defaultProps.style];
