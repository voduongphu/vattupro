import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildUserGuidePdfFileName,
  filterUserGuideSections,
  getUserGuideSections
} from './userGuideData.ts';

describe('userGuideData', () => {
  it('provides complete Vietnamese and English chapters covering all application modules', () => {
    const vi = getUserGuideSections('vi');
    const en = getUserGuideSections('en');

    assert.equal(vi.length, 9);
    assert.equal(en.length, 9);
    assert.deepEqual(
      vi.map((s) => s.id),
      en.map((s) => s.id)
    );

    const requiredIds = [
      'overview-auth',
      'dashboard',
      'inbound',
      'outbound',
      'osd',
      'report',
      'catalogs',
      'cloud-sync',
      'shortcuts'
    ];
    assert.deepEqual(
      vi.map((s) => s.id),
      requiredIds
    );

    for (const section of [...vi, ...en]) {
      assert.ok(section.title.trim().length > 5);
      assert.ok(section.summary.trim().length > 20);
      assert.ok(section.steps.length >= 2);
    }
  });

  it('keeps English user guide copy free of Vietnamese diacritics', () => {
    const en = getUserGuideSections('en');
    const vietDiacriticRe = /[À-ỹà-ỹĐđ]/;
    for (const sec of en) {
      assert.equal(vietDiacriticRe.test(sec.title), false, sec.title);
      assert.equal(vietDiacriticRe.test(sec.summary), false, sec.summary);
      assert.equal(vietDiacriticRe.test(sec.audienceLabel), false, sec.audienceLabel);
      if (sec.targetTabLabel) {
        assert.equal(vietDiacriticRe.test(sec.targetTabLabel), false, sec.targetTabLabel);
      }
      for (const st of sec.steps) {
        assert.equal(vietDiacriticRe.test(st.title), false, st.title);
        assert.equal(vietDiacriticRe.test(st.description), false, st.description);
      }
      for (const rule of sec.rules || []) {
        assert.equal(vietDiacriticRe.test(rule.label), false, rule.label);
        assert.equal(vietDiacriticRe.test(rule.detail), false, rule.detail);
      }
      if (sec.table) {
        for (const h of sec.table.headers) {
          assert.equal(vietDiacriticRe.test(h), false, h);
        }
        for (const row of sec.table.rows) {
          for (const cell of row) {
            assert.equal(vietDiacriticRe.test(cell), false, cell);
          }
        }
      }
    }
  });

  it('filters chapters accurately by keyword and generates valid PDF filenames', () => {
    const vi = getUserGuideSections('vi');
    assert.equal(filterUserGuideSections(vi, '').length, 9);

    const osdHits = filterUserGuideSections(vi, '25MB');
    assert.equal(osdHits.length, 1);
    assert.equal(osdHits[0].id, 'osd');

    const pkgHits = filterUserGuideSections(vi, 'PACKAGE No.');
    assert.ok(pkgHits.some((s) => s.id === 'report'));

    const shortcutHits = filterUserGuideSections(vi, 'Ctrl+Space');
    assert.ok(shortcutHits.some((s) => s.id === 'shortcuts'));

    assert.match(buildUserGuidePdfFileName('vi'), /^Huong_Dan_Su_Dung_Quan_Ly_Kho_Vat_Tu_\d{4}-\d{2}-\d{2}\.pdf$/);
    assert.match(buildUserGuidePdfFileName('en'), /^User_Guide_Logistics_Inventory_\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  it('immediately clears pause popup notice when clicking Bật lại đồng bộ in Navbar', () => {
    const navbarSrc = fs.readFileSync(
      path.resolve('src/components/layout/Navbar.tsx'),
      'utf8'
    );
    const resumeIdx = navbarSrc.indexOf('const handleResumeCloudSync = async () =>');
    assert.ok(resumeIdx > -1);
    const tryIdx = navbarSrc.indexOf('const res = await SyncService.syncCloudChangesOnly()', resumeIdx);
    assert.ok(tryIdx > resumeIdx);
    const beforeAwait = navbarSrc.slice(resumeIdx, tryIdx);
    assert.ok(
      beforeAwait.includes('setRemoteLogoutNotice(null)'),
      'Expected handleResumeCloudSync to clear remoteLogoutNotice immediately before awaiting sync'
    );
    assert.ok(
      beforeAwait.includes('setDismissedCloudErrorMsg('),
      'Expected handleResumeCloudSync to dismiss cloudState banner immediately before awaiting sync'
    );
  });
});
