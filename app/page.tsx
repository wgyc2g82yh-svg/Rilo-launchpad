export default function Home() {
  return (
    <main className="landing">
      <div className="metal-field" aria-hidden="true">
        <div className="metal-wave metal-wave-one" />
        <div className="metal-wave metal-wave-two" />
        <div className="metal-wave metal-wave-three" />
      </div>

      <section className="hero" aria-labelledby="brand-name">
        <div className="hero-content">
          <p className="hero-kicker">A NEW STANDARD IS TAKING SHAPE</p>
          <h1 id="brand-name">RILO</h1>
          <div className="hero-rule" aria-hidden="true"><span /></div>
          <p className="coming-soon">COMING SOON</p>
        </div>
        <p className="hero-index" aria-hidden="true">RILO&nbsp; / &nbsp;2026</p>
      </section>
    </main>
  );
}
