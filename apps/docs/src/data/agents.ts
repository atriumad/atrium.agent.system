import {happy, idle, love, shy, smug, surprised, thinking, wink} from 'blobatar/expression';

/**
 * The five engine agents and the orchestrator, shared by the home page and the footer.
 * Order is the loop: findable → seen → chosen → habit → revenue, with the orchestrator last.
 */
export const agents = [
  {
    key: 'concierge',
    name: 'Concierge',
    role: 'Discoverability',
    link: '/docs/system/engines#discoverability',
    seed: 'concierge',
    expression: thinking,
    hoverExpression: happy,
    palette: {head: '#0b5d55', eye: '#cfe7e1'},
    card: {bg: '#cfe7e1', fg: '#042f34'},
  },
  {
    key: 'herald',
    name: 'Herald',
    role: 'Acquisition',
    link: '/docs/system/engines#acquisition',
    seed: 'herald',
    expression: happy,
    hoverExpression: surprised,
    palette: {head: '#ffc933', eye: '#042f34'},
    card: {bg: '#042f34', fg: '#f3efe4'},
  },
  {
    key: 'host',
    name: 'Host',
    role: 'Reputation',
    link: '/docs/system/engines#reputation',
    seed: 'host',
    expression: wink,
    hoverExpression: love,
    palette: {head: '#1e8c7c', eye: '#f3efe4'},
    card: {bg: '#f3efe4', fg: '#042f34'},
  },
  {
    key: 'sommelier',
    name: 'Sommelier',
    role: 'Retention',
    link: '/docs/system/engines#retention',
    seed: 'sommelier',
    expression: shy,
    hoverExpression: happy,
    palette: {head: '#c0653a', eye: '#f3efe4'},
    card: {bg: '#f7d7c4', fg: '#4a2412'},
  },
  {
    key: 'steward',
    name: 'Steward',
    role: 'Growth',
    link: '/docs/system/engines#growth',
    seed: 'steward',
    expression: smug,
    hoverExpression: surprised,
    palette: {head: '#8a6410', eye: '#fff1c2'},
    card: {bg: '#fff1c2', fg: '#3d2c05'},
  },
  {
    key: 'maitre',
    name: 'Maître',
    role: 'Orchestrator',
    link: '/docs/system/metrics',
    seed: 'maitre',
    expression: idle,
    hoverExpression: smug,
    palette: {head: '#b8e89a', eye: '#042f34'},
    card: {bg: '#042f34', fg: '#f3efe4'},
  },
] as const;

export type Agent = (typeof agents)[number];
