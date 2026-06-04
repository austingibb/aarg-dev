export default function LlmsHeavyLifting() {
  return (
    <>
      <h2 id="the-misconception">The Misconception</h2>
      <p>
        A lot of people have convinced themselves that LLMs like ChatGPT will handle the heavy
        lifting in software engineering for them. That&apos;s not how the work breaks down.
      </p>
      <p>
        LLMs carry broad domain knowledge and are genuinely good at logic and reasoning. Where
        they fall apart is human intent, particularly in a business context.
      </p>

      <h2 id="what-engineers-actually-do">What Engineers Actually Do</h2>
      <p>
        Plenty of people would love for LLMs to replace expensive software engineers. The issue is
        that writing code was always the smallest part of the job. What an engineer actually brings
        is the ability to take something vague and turn it into a proper spec, a coherent
        architecture, and eventually a product a real user can open and use. The code matters, but
        it&apos;s downstream of all of that.
      </p>
      <p>
        You might not need to write every line by hand anymore, but understanding how computers
        think still matters. That part hasn&apos;t changed.
      </p>

      <h2 id="code-is-cheap">Code Is Cheap, Architecture Isn&apos;t</h2>
      <p>
        Code is genuinely cheap now. The architecture work isn&apos;t: deciding how to structure a
        system, where the seams go, what tradeoffs to accept. That&apos;s where an engineer earns
        their keep.
      </p>
      <p>
        AI is moving fast, so maybe I&apos;m wrong and nobody will hire me next year. I&apos;ve
        been surprised before.
      </p>

      <h2 id="productivity-multiplier">LLMs as a Productivity Multiplier</h2>
      <blockquote>
        &ldquo;Austin, if LLMs aren&apos;t doing the heavy lifting in software development, are
        they useless?&rdquo;
      </blockquote>
      <p>
        <em>Au contraire.</em> I use AI every single day for the Software Development Life Cycle.
        It frees me from writing a lot of boilerplate. For the kind of work I do, that&apos;s
        easily <strong>doubled what I can ship</strong>, though your mileage will vary by how much
        of your work is genuinely novel.
      </p>

      <h2 id="advice-for-sdes">Advice for SDEs Using LLMs</h2>
      <p>
        LLMs can give your workflow a real boost when you&apos;re driving, not the other way
        around. Here&apos;s what works:
      </p>
      <ul>
        <li>
          <strong>Stick to the SDLC.</strong> Treat the Software Development Life Cycle as a
          guardrail until AI-assisted workflows feel natural. It keeps you honest.
        </li>
        <li>
          <strong>You are the architect.</strong> Know your design before you open a chat window.
          Class diagrams, sequence charts, Mermaid diagrams, whatever gets the idea out of your
          head and onto paper. A current reasoning model is surprisingly good at this part.
        </li>
        <li>
          <strong>Don&apos;t start with code.</strong> AI will generate something that looks
          correct and misses the point entirely. Lock in the design first, then let it write.
        </li>
      </ul>
      <p>
        LLMs are also a solid way to learn programming. Walk a feature from analysis all the way
        to unit tests in one AI-guided session. It works better than most tutorials.
      </p>

      <h2 id="vibe-coding-myth">The Vibe Coding Myth</h2>
      <p>
        You&apos;re not vibe coding. You&apos;re coding with an LLM, and the difference is who
        holds the architecture. Vibe coding means the design lives in the model&apos;s output
        instead of in your head. That works for a prototype or a throwaway script. It falls apart
        the moment the thing has to be sustainable, maintainable, and extensible, because those
        aren&apos;t properties of code. They&apos;re properties of intent held consistently over
        time, and an LLM doesn&apos;t supply that. It generates locally correct code that looks
        right and quietly drifts out of alignment across sessions. Someone has to hold the
        throughline. That&apos;s still a person.
      </p>
      <p>
        LLM-assisted development under a human architect is a different thing entirely, and
        it&apos;s good. Vibe coding as a way to build real products is a sales pitch.
      </p>
      <p>
        If AI could genuinely replace a competent engineer, I&apos;d already be selling an
        autonomous software-building product. I&apos;m not, because I know what LLMs can and
        can&apos;t do. They&apos;re a tool. A good one, but a tool. They&apos;re not generally
        intelligent and they can&apos;t run a project on their own (yet). Prove me wrong if you
        want.
      </p>
      <p>
        One thing I do believe: LLMs will help a lot of people become real engineers. That&apos;s
        a good thing.
      </p>

      <h2 id="looking-ahead">Looking Ahead</h2>
      <p>
        The engineers who win are the ones who can carry a problem across more domains than they
        used to, because the tool now handles the parts that used to require deep specialization in
        each one. Used well, that raises the floor for everyone.
      </p>
    </>
  )
}
