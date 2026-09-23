import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import type { WidgetSummary } from '../../src/widgets/summary';

type NativeWidgets = { refresh(): Promise<void>; publish(json: string): Promise<void> };
const native = Platform.OS === 'web' ? null : requireOptionalNativeModule<NativeWidgets>('GramelloWidgets');

export async function refreshWidgets(read: () => Promise<WidgetSummary>) {
  if (!native) return; // Expo Go and older development builds have no extension.
  if (Platform.OS === 'ios') { await native.refresh(); return; }
  try { await native.publish(JSON.stringify(await read())); }
  catch (error) {
    // Do not leave a previously valid summary looking freshly verified.
    await native.publish(JSON.stringify({version:1,status:'unavailable'})).catch(() => {});
    throw error;
  }
}
