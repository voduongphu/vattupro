import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  KPI_WIDGET_CATALOG,
  MAIN_WIDGET_CATALOG,
  buildMonthlyInOutTrend,
  buildWarehouseStockBreakdown,
  computeWidgetRowSpans,
  getDefaultDashboardLayout,
  moveIdByStep,
  reorderIds,
  sanitizeDashboardLayout,
  toggleHiddenId
} from './dashboardLayout';
import { InboundReceipt, InventoryStockRecord, OutboundReceipt, Warehouse } from '../types/inventory';

describe('dashboardLayout', () => {
  it('reorders, steps, and toggles widget visibility immutably', () => {
    const initial = ['a', 'b', 'c', 'd'] as const;
    assert.deepEqual(reorderIds(initial, 'd', 'b'), ['a', 'd', 'b', 'c']);
    assert.deepEqual(reorderIds(initial, 'a', 'c'), ['b', 'c', 'a', 'd']);

    // Stepping within a visible subset skips hidden items cleanly
    const full = ['a', 'b', 'c', 'd'] as const;
    const visible = ['a', 'c', 'd'] as const; // 'b' is hidden
    assert.deepEqual(moveIdByStep(full, 'a', 1, visible), ['b', 'c', 'a', 'd']);
    assert.deepEqual(moveIdByStep(full, 'd', -1, visible), ['a', 'b', 'd', 'c']);

    // Toggle hide/show
    assert.deepEqual(toggleHiddenId(['a'], 'b'), ['a', 'b']);
    assert.deepEqual(toggleHiddenId(['a', 'b'], 'a'), ['b']);
  });

  it('sanitizes persisted layouts safely and appends newly introduced widgets', () => {
    const sanitized = sanitizeDashboardLayout({
      kpiOrder: ['kpi_warehouses', 'unknown_id', 'kpi_warehouses'],
      hiddenKpis: ['kpi_pl_shipment', 'bad_id'],
      widgetOrder: ['widget_recent_outbounds'],
      hiddenWidgets: ['widget_warehouse_stock']
    });

    assert.equal(sanitized.kpiOrder[0], 'kpi_warehouses');
    assert.equal(sanitized.kpiOrder.length, KPI_WIDGET_CATALOG.length);
    assert.deepEqual(sanitized.hiddenKpis, ['kpi_pl_shipment']);
    assert.equal(sanitized.widgetOrder[0], 'widget_recent_outbounds');
    assert.equal(sanitized.widgetOrder.length, MAIN_WIDGET_CATALOG.length);
    assert.deepEqual(sanitized.hiddenWidgets, ['widget_warehouse_stock']);

    // Null/corrupt falls back to defaults
    assert.deepEqual(sanitizeDashboardLayout(null), getDefaultDashboardLayout());
  });

  it('packs visible widgets into balanced 6-column desktop rows with zero orphan gaps', () => {
    // Default 5 widgets: [chart(3), chart(3)] + [cat(2), in(2), out(2)]
    const all5 = computeWidgetRowSpans([
      'widget_inout_trend',
      'widget_warehouse_stock',
      'widget_category_breakdown',
      'widget_recent_inbounds',
      'widget_recent_outbounds'
    ]);
    assert.equal(all5.widget_inout_trend, 3);
    assert.equal(all5.widget_warehouse_stock, 3);
    assert.equal(all5.widget_category_breakdown, 2);
    assert.equal(all5.widget_recent_inbounds, 2);
    assert.equal(all5.widget_recent_outbounds, 2);

    // Hide 1 chart & 1 list -> remaining chart expands to 6, remaining 2 lists expand to 3+3
    const three = computeWidgetRowSpans([
      'widget_inout_trend',
      'widget_recent_inbounds',
      'widget_recent_outbounds'
    ]);
    assert.equal(three.widget_inout_trend, 4);
    assert.equal(three.widget_recent_inbounds, 2);
    assert.equal(three.widget_recent_outbounds, 6);

    // Single remaining list widget expands to full width 6
    const one = computeWidgetRowSpans(['widget_category_breakdown']);
    assert.equal(one.widget_category_breakdown, 6);
  });

  it('builds 6-month inbound vs outbound trend anchored on latest voucher month', () => {
    const inbounds: InboundReceipt[] = [
      {
        id: 'in-1',
        receiptCode: 'PN-01',
        receiptDate: '2026-09-12',
        warehouseId: 'w1',
        warehouseName: 'Kho 1',
        supplier: 'A',
        shipment: 'S1',
        packingListNo: 'PL1',
        delivererName: 'D',
        receiverName: 'R',
        items: [
          {
            id: 'i1',
            materialCode: 'M1',
            materialName: 'Mat 1',
            unit: 'Cái',
            packingListNo: 'PL1',
            shipment: 'S1',
            manufacturer: '',
            supplier: 'A',
            packageNo: 'P1',
            packageName: '',
            category: 'Chung',
            drawingNo: '',
            weightKg: 250,
            quantity: 10
          }
        ],
        totalQuantity: 10,
        totalWeightKg: 250,
        createdAt: '2026-09-12',
        createdBy: 'admin'
      }
    ];
    const outbounds: OutboundReceipt[] = [
      {
        id: 'out-1',
        issueCode: 'PX-01',
        issueDate: '2026-11-05',
        warehouseId: 'w1',
        warehouseName: 'Kho 1',
        recipientDepartment: 'Tổ 1',
        recipientName: 'N',
        issuerName: 'I',
        items: [
          {
            id: 'o1',
            materialCode: 'M1',
            materialName: 'Mat 1',
            unit: 'Cái',
            packingListNo: 'PL1',
            shipment: 'S1',
            manufacturer: '',
            supplier: 'A',
            packageNo: 'P1',
            packageName: '',
            category: 'Chung',
            drawingNo: '',
            weightKg: 100,
            quantity: 4
          }
        ],
        totalQuantity: 4,
        totalWeightKg: 100,
        createdAt: '2026-11-05',
        createdBy: 'admin'
      }
    ];

    const series = buildMonthlyInOutTrend(inbounds, outbounds, 6);
    assert.equal(series.length, 6);
    assert.equal(series[0].monthKey, '2026-06');
    assert.equal(series[5].monthKey, '2026-11');
    assert.equal(series.find((p) => p.monthKey === '2026-09')?.inboundQty, 10);
    assert.equal(series.find((p) => p.monthKey === '2026-11')?.outboundQty, 4);
  });

  it('aggregates warehouse stock breakdown sorted by weight descending', () => {
    const warehouses: Warehouse[] = [
      {
        id: 'w1',
        code: 'K1',
        name: 'Kho Long Phú 1',
        location: 'Sóc Trăng',
        type: 'open_yard',
        status: 'active',
        createdAt: '2026-01-01'
      },
      {
        id: 'w2',
        code: 'K2',
        name: 'Kho Cát Lái',
        location: 'HCM',
        type: 'covered',
        status: 'active',
        createdAt: '2026-01-01'
      }
    ];
    const records: InventoryStockRecord[] = [
      {
        id: 'r1',
        warehouseId: 'w2',
        warehouseName: 'Kho Cát Lái',
        materialCode: 'M1',
        materialName: 'Mat 1',
        unit: 'Cái',
        packingListNo: 'PL1',
        shipment: 'S1',
        manufacturer: '',
        supplier: '',
        packageNo: 'P1',
        packageName: '',
        category: 'Chung',
        drawingNo: '',
        currentQuantity: 5,
        currentWeightKg: 100,
        inboundQuantity: 5,
        inboundWeightKg: 100,
        returnInboundQuantity: 0,
        returnInboundWeightKg: 0,
        outboundQuantity: 0,
        outboundWeightKg: 0,
        transferOutboundQuantity: 0,
        transferOutboundWeightKg: 0,
        lastUpdated: '2026-11-01'
      },
      {
        id: 'r2',
        warehouseId: 'w1',
        warehouseName: 'Kho Long Phú 1',
        materialCode: 'M2',
        materialName: 'Mat 2',
        unit: 'Tấm',
        packingListNo: 'PL2',
        shipment: 'S2',
        manufacturer: '',
        supplier: '',
        packageNo: 'P2',
        packageName: '',
        category: 'Chung',
        drawingNo: '',
        currentQuantity: 20,
        currentWeightKg: 5000,
        inboundQuantity: 30,
        inboundWeightKg: 7500,
        returnInboundQuantity: 0,
        returnInboundWeightKg: 0,
        outboundQuantity: 10,
        outboundWeightKg: 2500,
        transferOutboundQuantity: 0,
        transferOutboundWeightKg: 0,
        lastUpdated: '2026-11-02'
      }
    ];

    const breakdown = buildWarehouseStockBreakdown(records, warehouses);
    assert.equal(breakdown.length, 2);
    assert.equal(breakdown[0].warehouseId, 'w1');
    assert.equal(breakdown[0].stockWeightKg, 5000);
    assert.equal(breakdown[0].inboundQty, 30);
    assert.equal(breakdown[0].outboundQty, 10);
    assert.equal(breakdown[1].warehouseId, 'w2');
  });
});
