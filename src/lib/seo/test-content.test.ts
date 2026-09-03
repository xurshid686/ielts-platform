import { describe, it, expect } from "vitest";
import { extractSeoContent, parseExplanations, fragmentToText } from "./test-content";

/**
 * The four container shapes in storage. Getting one wrong is silent — the page
 * still renders, just with an empty section — so each is pinned here.
 * See the comment on `proseKindOf`.
 */
const SINGLE = `
<section class="passage-container" id="passage-container">
  <div id="passageContent">
    <h1>The Voynich Manuscript</h1>
    <p id="para-1">The starkly modern Beinecke Library at Yale.</p>
    <p id="para-2">Catalogued as MS408 &ndash; a code no-one has broken.</p>
  </div>
</section>`;

const FULL_IDS = `
<div id="passageContent-p1"><h1>Carnivorous plant</h1><p>One.</p></div>
<div id="passageContent-p2"><h1>Drawing Lessons</h1><p>Two.</p></div>
<div id="passageContent-p3"><h1>Neanderthal Technology</h1><p>Three.</p></div>`;

const FULL_CLASSES = `
<div class="passage-section active" data-part="1">
  <div class="sectionRubric"><h2>Reading Passage 1</h2><p>Spend 20 minutes.</p></div>
  <div class="passage-content">
    <h2>Socotra Island</h2>
    <p class="subtitle">Situated in the Arabian Sea.</p>
  </div>
</div>`;

const LISTENING = `
<div class="script-text" id="scriptText">
  <h3>Part 1</h3>
  <p class="nar">Test 1, Section 1.</p>
  <p><b>Researcher:</b> Oh, excuse me.</p>
</div>`;

describe("prose extraction", () => {
  it("reads a single reading passage and lifts its <h1> as the title", () => {
    const c = extractSeoContent(SINGLE);
    expect(c.passages).toHaveLength(1);
    expect(c.passages[0].title).toBe("The Voynich Manuscript");
    // The title is lifted OUT of the body, not left to repeat.
    expect(c.passages[0].html).not.toMatch(/Voynich/);
    expect(c.passages[0].html).toContain("<p>The starkly modern");
    expect(c.wordCount).toBeGreaterThan(10);
  });

  it("reads all three passages of an id-based full test, in order", () => {
    const c = extractSeoContent(FULL_IDS);
    expect(c.passages.map((p) => p.title)).toEqual([
      "Carnivorous plant",
      "Drawing Lessons",
      "Neanderthal Technology",
    ]);
  });

  it("reads a class-based full test, which carries no usable ids", () => {
    const c = extractSeoContent(FULL_CLASSES);
    expect(c.passages).toHaveLength(1);
    expect(c.passages[0].title).toBe("Socotra Island");
    // The rubric sits OUTSIDE .passage-content, so it must not be swept in.
    expect(c.passages[0].html).not.toMatch(/Spend 20 minutes/);
    expect(c.passages[0].html).toContain("Situated in the Arabian Sea");
  });

  it("keeps a transcript's Part headings instead of lifting one as a title", () => {
    const c = extractSeoContent(LISTENING);
    expect(c.passages).toHaveLength(1);
    expect(c.passages[0].title).toBeNull();
    expect(c.passages[0].html).toContain("Part 1");
  });

  it("does not emit a container twice when one prose block nests in another", () => {
    const nested = `<div id="passageContent"><h1>Outer</h1><p>Body.</p><div class="passage-content"><p>Inner.</p></div></div>`;
    const c = extractSeoContent(nested);
    expect(c.passages).toHaveLength(1);
  });

  it("skips a container that holds no prose", () => {
    expect(extractSeoContent(`<div id="passageContent"><button>Go</button></div>`).passages).toEqual(
      [],
    );
  });

  it("returns empty content rather than throwing on a file it cannot read", () => {
    expect(extractSeoContent("<html><body>nothing here</body></html>")).toEqual({
      passages: [],
      wordCount: 0,
      explanations: {},
    });
  });
});

describe("passage sanitization", () => {
  it("drops runner attributes so the markup cannot collide with the page", () => {
    const c = extractSeoContent(`<div id="passageContent"><p id="para-1" class="x">Hi there.</p></div>`);
    expect(c.passages[0].html).toBe("<p>Hi there.</p>");
  });

  it("removes script and style content entirely, not just their tags", () => {
    const c = extractSeoContent(
      `<div id="passageContent"><p>Safe words here.</p><script>steal()</script><style>p{color:red}</style></div>`,
    );
    expect(c.passages[0].html).not.toMatch(/steal|color:red/);
  });

  it("strips a disallowed tag but keeps the words inside it", () => {
    const c = extractSeoContent(
      `<div id="passageContent"><p>A <span onclick="x()">labelled</span> word.</p></div>`,
    );
    expect(c.passages[0].html).toBe("<p>A labelled word.</p>");
  });

  it("demotes a titled passage's inner headings below the title's own level", () => {
    // The page renders <h2> section / <h3> passage name, so what is left inside
    // the passage has to start at <h4>.
    const c = extractSeoContent(
      `<div id="passageContent"><h1>Name</h1><p>Lead.</p><h2>A section</h2><p>More.</p></div>`,
    );
    expect(c.passages[0].html).toContain("<h4>A section</h4>");
    expect(c.passages[0].html).not.toMatch(/<h1|<h2|<h3/);
  });

  it("keeps an untitled block's headings at <h3>, with no level skipped", () => {
    // A transcript has no name of its own, so its "Part 1" headings sit
    // directly under the section's <h2>.
    const c = extractSeoContent(`<div id="scriptText"><h3>Part 1</h3><p>Now we begin.</p></div>`);
    expect(c.passages[0].html).toContain("<h3>Part 1</h3>");
  });
});

describe("explanations", () => {
  const SRC = `
    const correctAnswers = { 27: "TRUE" };
    const explanations = {
        27: { answer: "TRUE",
             evidence: "Paragraph 1: \\"240-odd pages\\" of drawings.",
             why: "Not FALSE \\u2014 nothing contradicts it." },
        "40": { answer: 'C', why: 'Not A.' },
    };
    const evidence = { 27: { para: "para-1" } };`;

  it("parses a JS object literal with bare numeric keys and mixed quotes", () => {
    const e = parseExplanations(SRC);
    expect(Object.keys(e).sort()).toEqual(["27", "40"]);
    expect(e["27"].answer).toBe("TRUE");
    expect(e["27"].evidence).toContain("240-odd pages");
    expect(e["27"].why).toContain("Not FALSE —");
    expect(e["40"].answer).toBe("C");
  });

  it("does not confuse a nested `evidence` key with the top-level literal", () => {
    // `explanations` entries contain their own `evidence:` field, and a separate
    // `evidence = {…}` literal follows. Both must survive intact.
    expect(parseExplanations(SRC)["27"].evidence).toMatch(/^Paragraph 1/);
  });

  it("is empty, not thrown, for a file with no explanations block", () => {
    expect(parseExplanations("<html></html>")).toEqual({});
  });

  it("ignores a property access that merely looks like the literal", () => {
    expect(parseExplanations("if (window.explanations = {}) {}")).toEqual({});
  });
});

describe("fragmentToText", () => {
  it("resolves the entities the CDI files actually emit", () => {
    expect(fragmentToText("<p>a &ndash; b &lsquo;c&rsquo; &amp; &#8212; &#x2014;</p>")).toBe(
      "a – b ‘c’ & — —",
    );
  });
});
