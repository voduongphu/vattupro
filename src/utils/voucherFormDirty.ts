import type { InboundItemDetail, OutboundItemDetail } from '../types/inventory';

export interface InboundFormSnapshotInput {
  receiptCode: string;
  receiptDate: string;
  selectedWarehouseId: string;
  formDepartmentName: string;
  formDeliverer: string;
  formContractNo: string;
  formRequestNo: string;
  formNotes: string;
  formInboundType: 'new' | 'return';
  formAmountInWords: string;
  formAttachedDocs: string;
  formSupplier: string;
  formManufacturer: string;
  formShipment: string;
  formPackingListNo: string;
  formDriverVehicle: string;
  formStorageLocation: string;
  formItems: readonly InboundItemDetail[];
}

export interface OutboundFormSnapshotInput {
  issueCode: string;
  issueDate: string;
  selectedWarehouseId: string;
  formDepartmentName: string;
  recipientName: string;
  recipientDepartment: string;
  formRequestNo: string;
  formNotes: string;
  formOutboundType: 'issue' | 'transfer';
  formItems: readonly OutboundItemDetail[];
}

const normStr = (val?: string | null): string => (val == null ? '' : String(val));

const normNum = (val?: number | string | null): number => {
  if (val === '' || val == null) return 0;
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
};

export function computeInboundFormSnapshot(input: InboundFormSnapshotInput): string {
  return JSON.stringify({
    receiptCode: normStr(input.receiptCode),
    receiptDate: normStr(input.receiptDate),
    selectedWarehouseId: normStr(input.selectedWarehouseId),
    formDepartmentName: normStr(input.formDepartmentName),
    formDeliverer: normStr(input.formDeliverer),
    formContractNo: normStr(input.formContractNo),
    formRequestNo: normStr(input.formRequestNo),
    formNotes: normStr(input.formNotes),
    formInboundType: input.formInboundType,
    formAmountInWords: normStr(input.formAmountInWords),
    formAttachedDocs: normStr(input.formAttachedDocs),
    formSupplier: normStr(input.formSupplier),
    formManufacturer: normStr(input.formManufacturer),
    formShipment: normStr(input.formShipment),
    formPackingListNo: normStr(input.formPackingListNo),
    formDriverVehicle: normStr(input.formDriverVehicle),
    formStorageLocation: normStr(input.formStorageLocation),
    formItems: (input.formItems || []).map((it) => ({
      materialCode: normStr(it.materialCode),
      materialName: normStr(it.materialName),
      unit: normStr(it.unit),
      batchCode: normStr(it.batchCode),
      packingListNo: normStr(it.packingListNo),
      shipment: normStr(it.shipment),
      packageNo: normStr(it.packageNo),
      packageName: normStr(it.packageName),
      category: normStr(it.category),
      drawingNo: normStr(it.drawingNo),
      manufacturer: normStr(it.manufacturer),
      supplier: normStr(it.supplier),
      weightKg: normNum(it.weightKg),
      quantity: normNum(it.quantity),
      unitPrice: normNum(it.unitPrice),
      totalPrice: normNum(it.totalPrice),
      storageLocation: normStr(it.storageLocation),
      conditionNote: normStr(it.conditionNote),
      note: normStr(it.note)
    }))
  });
}

export function computeOutboundFormSnapshot(input: OutboundFormSnapshotInput): string {
  return JSON.stringify({
    issueCode: normStr(input.issueCode),
    issueDate: normStr(input.issueDate),
    selectedWarehouseId: normStr(input.selectedWarehouseId),
    formDepartmentName: normStr(input.formDepartmentName),
    recipientName: normStr(input.recipientName),
    recipientDepartment: normStr(input.recipientDepartment),
    formRequestNo: normStr(input.formRequestNo),
    formNotes: normStr(input.formNotes),
    formOutboundType: input.formOutboundType,
    formItems: (input.formItems || []).map((it) => ({
      materialCode: normStr(it.materialCode),
      materialName: normStr(it.materialName),
      unit: normStr(it.unit),
      batchCode: normStr(it.batchCode),
      packingListNo: normStr(it.packingListNo),
      shipment: normStr(it.shipment),
      packageNo: normStr(it.packageNo),
      packageName: normStr(it.packageName),
      category: normStr(it.category),
      drawingNo: normStr(it.drawingNo),
      manufacturer: normStr(it.manufacturer),
      supplier: normStr(it.supplier),
      quantity: normNum(it.quantity),
      weightKg: normNum(it.weightKg),
      purpose: normStr(it.purpose),
      note: normStr(it.note)
    }))
  });
}

export function hasFormSnapshotChanged(
  initialSnapshot: string | null | undefined,
  currentSnapshot: string
): boolean {
  if (!initialSnapshot) return false;
  return initialSnapshot !== currentSnapshot;
}

export function shouldConfirmModalClose(options: {
  confirmOnEsc?: boolean;
  hasUnsavedChanges?: boolean;
  trigger: 'esc' | 'close';
}): boolean {
  if (options.trigger === 'close') {
    return Boolean(options.hasUnsavedChanges);
  }
  if (!options.confirmOnEsc) return false;
  if (typeof options.hasUnsavedChanges === 'boolean') {
    return options.hasUnsavedChanges;
  }
  return true;
}
