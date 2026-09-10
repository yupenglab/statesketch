import styles from './App.module.css';

export function App() {
  return (
    <main className={styles.shell}>
      <section className={styles.intro} aria-labelledby="page-title">
        <p className={styles.eyebrow}>Experimental pre-alpha</p>
        <h1 id="page-title">StateSketch</h1>
        <p className={styles.positioning}>
          Interactive mental-model lab for exploring concurrency.
        </p>
        <p className={styles.status}>
          Prototype implementation has not started yet.
        </p>
      </section>
    </main>
  );
}
