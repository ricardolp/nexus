import {
  canTransitionInbound,
  mapInboundToStatusInterno,
} from '../../src/nfe-inbound-process/inbound-status';

describe('inbound-status', () => {
  it('allows xml_imported to sefaz_validated', () => {
    expect(canTransitionInbound('xml_imported', 'sefaz_validated')).toBe(true);
  });

  it('blocks invalid transition', () => {
    expect(canTransitionInbound('xml_imported', 'miro_done')).toBe(false);
  });

  it('maps miro_done to faturada', () => {
    expect(mapInboundToStatusInterno('miro_done')).toBe('faturada');
  });
});
