import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useBarcodeScanner } from '../../../hooks/use-barcode-scanner';
import type { BarcodeScannerProps } from '../../../lib/barcode';
import { Action, colors, ErrorNotice, Field, styles } from './ui';

export function BarcodeScanner(props: BarcodeScannerProps) {
  const scanner = useBarcodeScanner(props);
  const { cameraError } = scanner;
  const [permission, requestPermission, refreshPermission] = useCameraPermissions();
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      setActive(state === 'active');
      if (state === 'active') void refreshPermission().catch(() => cameraError('Camera access is unavailable. Enter the barcode below.'));
    });
    return () => subscription.remove();
  }, [refreshPermission, cameraError]);

  return <View style={{ gap: 16 }}>
    <Action quiet secondary onPress={props.onBack}>← Search by name</Action>
    {scanner.scanning ? <>
      {!permission ? <ActivityIndicator color={colors.mint} /> : permission.granted && active ? <View style={{ height: 210, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.background }}>
        <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'itf14'] }}
          onBarcodeScanned={({ data }) => void scanner.find(data)}
          onMountError={() => scanner.cameraError('The camera could not start. Try again or enter the barcode below.')} />
        <View pointerEvents="none" style={{ position: 'absolute', top: '27%', bottom: '27%', left: '10%', right: '10%', borderWidth: 2, borderColor: colors.mint, borderRadius: 12 }} />
      </View> : !permission.granted ? <View style={{ gap: 12 }}>
        <Text style={styles.muted}>{permission.canAskAgain ? 'Allow camera access to scan a food barcode.' : 'Camera access is off. Enable it in Settings or enter the barcode below.'}</Text>
        <Action secondary onPress={() => { void (permission.canAskAgain ? requestPermission() : Linking.openSettings()).catch(() => scanner.cameraError('Camera access is unavailable. Enter the barcode below.')); }}>{permission.canAskAgain ? 'Enable camera' : 'Open settings'}</Action>
      </View> : null}
      <Text style={styles.muted}>Center the product barcode in the frame. Hold steady in good light.</Text>
      <Action secondary onPress={scanner.stopCamera}>Enter barcode manually</Action>
    </> : <Action secondary disabled={scanner.busy} onPress={scanner.rescan}>Scan again</Action>}
    {scanner.error && <ErrorNotice message={scanner.error} />}
    <Field label="Barcode number" value={scanner.code} onChangeText={scanner.edit} onFocus={scanner.stopCamera} keyboardType="number-pad" maxLength={32}
      placeholder="Enter the numbers below the barcode" editable={!scanner.busy} autoCorrect={false} onSubmitEditing={() => void scanner.find(scanner.code)} />
    <Action busy={scanner.busy} disabled={!scanner.code.trim()} onPress={() => void scanner.find(scanner.code)}>{scanner.busy ? 'Looking up barcode…' : 'Look up barcode'}</Action>
    <Text accessibilityLiveRegion="polite" style={styles.muted}>{scanner.busy ? 'Finding your product in Open Food Facts…' : 'Product details from Open Food Facts. Review the serving size before adding.'}</Text>
  </View>;
}
