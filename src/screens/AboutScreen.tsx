export function AboutScreen() {
  return (
    <div className="page prose-page">
      <header className="page-header">
        <h1>About StudySAT</h1>
        <p className="lede">A free, open-source study tool for the digital SAT.</p>
      </header>

      <section>
        <h2>Where the questions come from</h2>
        <p>
          Every question, answer key and explanation is loaded live, in your browser, from the College Board’s public{' '}
          <a href="https://satsuiteeducatorquestionbank.collegeboard.org/" target="_blank" rel="noopener noreferrer">
            SAT Suite Educator Question Bank
          </a>
          . StudySAT doesn’t host, copy or modify any question content, and it never writes its own questions or answer keys.
        </p>
        <p>
          A small number of older Math items don’t include a separate answer key. For those, StudySAT uses the answer that the
          item’s own explanation states (for example, “Choice D is correct.”). Items whose answer can’t be determined reliably, or
          whose key contradicts its explanation, are left out.
        </p>
        <p>
          Domains, skills and difficulty levels shown in the app are taken from the question bank’s own data. Difficulty is the
          question bank’s Easy / Medium / Hard rating.
        </p>
      </section>

      <section>
        <h2>Licensing and trademarks</h2>
        <p>
          StudySAT’s source code is released under the MIT License. That license covers the app’s code only. The questions,
          answers and explanations are © College Board and are subject to College Board’s terms of use; they are not part of
          this project and are not covered by its license.
        </p>
        <p>
          SAT® is a trademark registered by the College Board, which is not affiliated with, and does not endorse, this
          project.
        </p>
      </section>

      <section>
        <h2>Privacy</h2>
        <p>
          There are no accounts, ads or analytics. Your settings and unfinished sessions are stored only in your browser’s local
          storage. The only network requests are to the College Board question bank.
        </p>
      </section>

      <section>
        <h2>Limitations</h2>
        <ul>
          <li>The question bank API is public but not officially documented, so it may change or become unavailable without notice.</li>
          <li>Test scores are the percentage of questions answered correctly. They are not scaled SAT scores.</li>
          <li>Math is rendered with your browser’s built-in MathML support; very old browsers may display it poorly.</li>
        </ul>
      </section>
    </div>
  );
}
