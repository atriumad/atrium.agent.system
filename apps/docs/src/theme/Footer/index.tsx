import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import Translate from '@docusaurus/Translate';
import useBaseUrl from '@docusaurus/useBaseUrl';
import {Blobatar} from '@blobatar/react';
import {agents} from '../../data/agents';

/** What each agent is measured by, straight from the Growth System. */
const metrics: Record<string, ReactNode> = {
  concierge: <Translate id="footer.metric.concierge">GBP actions: directions, calls and website clicks</Translate>,
  herald: <Translate id="footer.metric.herald">Impressions, 30 days</Translate>,
  host: <Translate id="footer.metric.host">Google rating against the 10-mile average</Translate>,
  sommelier: <Translate id="footer.metric.sommelier">Repeat guest rate</Translate>,
  steward: <Translate id="footer.metric.steward">ROAS by program, with cost per action</Translate>,
  maitre: <Translate id="footer.metric.maitre">The Growth Score, 0–300</Translate>,
};

export default function Footer(): ReactNode {
  const logo = useBaseUrl('/img/logo-dark.svg');
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__intro">
          <Link to="/" className="site-footer__brand">
            <img src={logo} alt="" width={28} height={28} />
            <span>Atrium</span>
          </Link>
          <p>
            <Translate id="footer.intro">
              Five engines, one score. Every page in this documentation belongs to a part of the Growth System.
            </Translate>
          </p>
        </div>

        <div className="site-footer__agents">
          {agents.map((a) => (
            <div key={a.key} className="site-footer__agent">
              <div className="site-footer__agent-head">
                <Blobatar
                  name={a.seed}
                  size={40}
                  background="squircle"
                  expression={a.expression}
                  palette={{bg: a.card.bg, head: a.palette.head, eye: a.palette.eye}}
                  title={a.name}
                />
                <div>
                  <Link to={`/docs/agents/${a.key}`} className="site-footer__agent-name">
                    {a.name}
                  </Link>
                  <Link to={a.link} className="site-footer__agent-role">
                    {a.role}
                  </Link>
                </div>
              </div>
              <p className="site-footer__metric">{metrics[a.key]}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="site-footer__bar">
        <nav className="site-footer__links">
          <Link to="/docs/system/glossary"><Translate id="footer.link.glossary">Glossary</Translate></Link>
          <Link to="/docs/system/metrics"><Translate id="footer.link.metrics">Metrics</Translate></Link>
          <Link to="/docs/architecture"><Translate id="footer.link.architecture">Architecture</Translate></Link>
          <Link to="/docs/plan"><Translate id="footer.link.plan">Plan</Translate></Link>
          <Link to="/docs/adr"><Translate id="footer.link.adr">Decisions</Translate></Link>
          <Link to="/docs/guides"><Translate id="footer.link.guides">Guides</Translate></Link>
        </nav>
        <span className="site-footer__copy">
          <Translate id="footer.copyright">Atrium Agency · Internal documentation</Translate> · {new Date().getFullYear()}
        </span>
      </div>
    </footer>
  );
}
