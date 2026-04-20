import { buildFontScaleInject } from './fontScaleInject';

describe('buildFontScaleInject', () => {
  it('applies 1.0 font scale', () => {
    const js = buildFontScaleInject(1.0);
    expect(js).toContain("1rem");
    expect(js).toContain("--ws-font-scale");
  });

  it('applies 1.5 font scale', () => {
    const js = buildFontScaleInject(1.5);
    expect(js).toContain("1.5rem");
  });

  it('clamps below 0.8 to 0.8', () => {
    const js = buildFontScaleInject(0.5);
    expect(js).toContain("0.8rem");
  });

  it('clamps above 2.0 to 2.0', () => {
    const js = buildFontScaleInject(3.0);
    expect(js).toContain("2rem");
  });

  it('ends with true for injectedJavaScript protocol', () => {
    const js = buildFontScaleInject(1.0);
    expect(js).toContain('true;');
  });
});
