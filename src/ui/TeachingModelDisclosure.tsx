import styles from './App.module.css';

export function TeachingModelDisclosure() {
  return (
    <section className={styles.teachingModel} aria-label="Teaching model">
      <p>Each click advances one conceptual step in this teaching model.</p>
      <p>
        You are choosing a possible execution ordering, not simulating a
        complete OS scheduler.
      </p>
      <details>
        <summary>More about this teaching model</summary>
        <p>
          Conceptual steps are not CPU instructions. Sequential consistency is a
          teaching simplification, and concurrency is not identical to physical
          parallel execution. This language-neutral model does not represent C
          or C++ data-race or memory-model semantics.
        </p>
      </details>
    </section>
  );
}
