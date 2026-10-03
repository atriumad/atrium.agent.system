import {useState, type CSSProperties, type ReactNode} from 'react';
import Link from '@docusaurus/Link';
import Translate, {translate} from '@docusaurus/Translate';
import Layout from '@theme/Layout';
import {Blobatar} from '@blobatar/react';
import {useGaze} from '@blobatar/react/gaze';
import {agents, type Agent} from '../data/agents';
import 'blobatar/motion.css';
import 'blobatar/gaze.css';

function AgentCard({agent}: {agent: Agent}): ReactNode {
  const {ref} = useGaze({travel: 3, lookAt: 'pointer'});
  const [active, setActive] = useState(false);
  return (
    <Link
      className="agent"
      to={`/docs/agents/${agent.key}`}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
      style={{'--agent-bg': agent.card.bg, '--agent-fg': agent.card.fg} as CSSProperties}>
      <Blobatar
        ref={ref}
        name={agent.seed}
        animate="always"
        expression={active ? agent.hoverExpression : agent.expression}
        palette={agent.palette}
        title={agent.name}
      />
      <span className="agent__label">
        <span className="agent__name">{agent.name}</span>
        <span className="agent__role">{agent.role}</span>
      </span>
      <span className="agent__arrow" aria-hidden="true">→</span>
    </Link>
  );
}

export default function Home(): ReactNode {
  return (
    <Layout
      title={translate({id: 'home.metaTitle', message: 'A system that turns strangers into regulars'})}
      description={translate({id: 'home.metaDescription', message: 'Atrium Docs: the source of truth for the Atrium Growth System. Five engines, the data behind one score, six agents and the plan to build it.'})}>
      <main className="home">
        <h1 className="home__title">
          <Translate id="home.title.before">A system that turns strangers into</Translate>{' '}
          <em>
            <Translate id="home.title.emphasis">regulars</Translate>
          </em>
          .
        </h1>
        <p className="home__lead">
          <Translate id="home.lead">
            The source of truth for the Atrium Growth System and the platform that runs it: five engines, the data behind one score, the agents and the plan to build it.
          </Translate>
        </p>
        <Link className="btn-primary" to="/docs/system">
          <Translate id="home.cta">Get started</Translate>
        </Link>
        <div className="agents">
          {agents.map((a) => (
            <AgentCard key={a.key} agent={a} />
          ))}
        </div>
      </main>
    </Layout>
  );
}
