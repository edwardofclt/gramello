export type BarcodeFood = {
  id: string; name: string; brand?: string; source: string;
  calories: number; protein: number; carbs: number; fat: number;
  servingGrams: number; servingLabel: string; image?: string;
};

// Keep codes as strings: leading zeros are part of the product identifier.
export function normalizeBarcode(value: string): string | null {
  const code = value.replace(/[\s-]/g, '');
  return /^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(code) ? code : null;
}

export type BarcodeScannerProps = {
  lookup: (barcode: string, signal: AbortSignal) => Promise<BarcodeFood>;
  onFound: (food: BarcodeFood) => void;
  onBack: () => void;
};
