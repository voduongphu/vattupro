import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeInboundFormSnapshot,
  computeOutboundFormSnapshot,
  hasFormSnapshotChanged,
  shouldConfirmModalClose,
  type InboundFormSnapshotInput,
  type OutboundFormSnapshotInput
} from './voucherFormDirty.ts';

const createBaseInboundInput = (): InboundFormSnapshotInput => ({
  receiptCode: 'PNK26-0001',
  receiptDate: '2026-03-15',
  selectedWarehouseId: 'wh-01',
  formDepartmentName: 'Phòng Vật tư',
  formDeliverer: 'Nguyễn Văn A',
  formContractNo: 'HD-2026-01',
  formRequestNo: 'YC-01',
  formNotes: 'Ghi chú ban đầu',
  formInboundType: 'new',
  formAttachedDocs: 'CO/CQ',
  formSupplier: 'NCC A',
  formManufacturer: 'NSX A',
  formShipment: 'SHP-01',
  formPackingListNo: 'PL-01',
  formDriverVehicle: '76C-12345',
  formStorageLocation: 'Bãi A1',
  formItems: [
    {
      id: 'item-1',
      materialCode: 'VT-001',
      materialName: 'Ống thép DN100',
      unit: 'Ống',
      batchCode: 'B01',
      packingListNo: 'PL-01',
      shipment: 'SHP-01',
      packageNo: 'K01',
      packageName: 'Kiện K01',
      category: 'Ống thép',
      drawingNo: 'DRW-01',
      manufacturer: 'NSX A',
      supplier: 'NCC A',
      weightKg: 120.5,
      quantity: 10,
      unitPrice: 500000,
      totalPrice: 5000000,
      storageLocation: 'Bãi A1',
      conditionNote: '',
      note: ''
    }
  ]
});

const createBaseOutboundInput = (): OutboundFormSnapshotInput => ({
  issueCode: 'PXK26-0001',
  issueDate: '2026-03-16',
  selectedWarehouseId: 'wh-01',
  formDepartmentName: 'Xưởng cơ khí',
  recipientName: 'Trần Văn B',
  recipientDepartment: 'Tổ thi công 1',
  formRequestNo: 'YCX-01',
  formNotes: '',
  formOutboundType: 'issue',
  formItems: [
    {
      id: 'out-1',
      materialCode: 'VT-001',
      materialName: 'Ống thép DN100',
      unit: 'Ống',
      batchCode: 'B01',
      packingListNo: 'PL-01',
      shipment: 'SHP-01',
      packageNo: 'K01',
      packageName: 'Kiện K01',
      category: 'Ống thép',
      drawingNo: 'DRW-01',
      manufacturer: 'NSX A',
      supplier: 'NCC A',
      quantity: 4,
      weightKg: 48.2,
      purpose: 'Lắp đặt',
      note: 'Lắp đặt'
    }
  ]
});

describe('voucherFormDirty', () => {
  it('returns false when inbound edit form has no data changes', () => {
    const initial = computeInboundFormSnapshot(createBaseInboundInput());
    const current = computeInboundFormSnapshot(createBaseInboundInput());
    assert.equal(hasFormSnapshotChanged(initial, current), false);
  });

  it('detects inbound header and item edits, and clears dirty state if reverted', () => {
    const base = createBaseInboundInput();
    const initial = computeInboundFormSnapshot(base);

    // Edit quantity
    const editedQty = createBaseInboundInput();
    editedQty.formItems = [{ ...editedQty.formItems[0], quantity: 12 }];
    assert.equal(hasFormSnapshotChanged(initial, computeInboundFormSnapshot(editedQty)), true);

    // Edit supplier / manufacturer / storageLocation header
    const editedMeta = createBaseInboundInput();
    editedMeta.formManufacturer = 'NSX B';
    assert.equal(hasFormSnapshotChanged(initial, computeInboundFormSnapshot(editedMeta)), true);

    // Add a new item row
    const addedRow = createBaseInboundInput();
    addedRow.formItems = [...addedRow.formItems, { ...addedRow.formItems[0], id: 'item-2' }];
    assert.equal(hasFormSnapshotChanged(initial, computeInboundFormSnapshot(addedRow)), true);

    // Revert back to original values (even with different transient item id)
    const reverted = createBaseInboundInput();
    reverted.formItems = [{ ...reverted.formItems[0], id: 'item-recloned' }];
    assert.equal(hasFormSnapshotChanged(initial, computeInboundFormSnapshot(reverted)), false);
  });

  it('returns false when outbound edit form has no data changes and detects item/header edits', () => {
    const initial = computeOutboundFormSnapshot(createBaseOutboundInput());
    const untouched = computeOutboundFormSnapshot(createBaseOutboundInput());
    assert.equal(hasFormSnapshotChanged(initial, untouched), false);

    // Edit weightKg
    const editedWeight = createBaseOutboundInput();
    editedWeight.formItems = [{ ...editedWeight.formItems[0], weightKg: 50 }];
    assert.equal(hasFormSnapshotChanged(initial, computeOutboundFormSnapshot(editedWeight)), true);

    // Edit recipientName
    const editedHeader = createBaseOutboundInput();
    editedHeader.recipientName = 'Lê Văn C';
    assert.equal(hasFormSnapshotChanged(initial, computeOutboundFormSnapshot(editedHeader)), true);

    // Remove item row
    const removedRow = createBaseOutboundInput();
    removedRow.formItems = [];
    assert.equal(hasFormSnapshotChanged(initial, computeOutboundFormSnapshot(removedRow)), true);
  });

  it('enforces shouldConfirmModalClose rules for close button and ESC key', () => {
    // Close button ("X"): confirm ONLY when unsaved changes exist
    assert.equal(
      shouldConfirmModalClose({ confirmOnEsc: true, hasUnsavedChanges: false, trigger: 'close' }),
      false
    );
    assert.equal(
      shouldConfirmModalClose({ confirmOnEsc: true, hasUnsavedChanges: true, trigger: 'close' }),
      true
    );

    // ESC key on voucher edit form with explicit dirty tracking:
    // clean -> close immediately; dirty -> prompt confirmation
    assert.equal(
      shouldConfirmModalClose({ confirmOnEsc: true, hasUnsavedChanges: false, trigger: 'esc' }),
      false
    );
    assert.equal(
      shouldConfirmModalClose({ confirmOnEsc: true, hasUnsavedChanges: true, trigger: 'esc' }),
      true
    );

    // ESC key on legacy confirmOnEsc modals without dirty tracking -> still prompts
    assert.equal(
      shouldConfirmModalClose({ confirmOnEsc: true, hasUnsavedChanges: undefined, trigger: 'esc' }),
      true
    );

    // ESC key on non-guarded dialogs -> close immediately
    assert.equal(
      shouldConfirmModalClose({ confirmOnEsc: false, hasUnsavedChanges: true, trigger: 'esc' }),
      false
    );
  });
});
