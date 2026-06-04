import LlmsHeavyLifting from './llms-heavy-lifting.jsx'

export const posts = [
  {
    slug: 'llms-heavy-lifting',
    title: 'The Heavy Lifting Was Never the Code',
    date: '2026-05-05',
    author: 'Austin Gibbons',
    readingTime: '4 min read',
    tags: ['AI', 'Software Engineering', 'LLMs'],
    excerpt:
      "So many people wish LLMs could replace expensive software engineers. The true value of an engineer is turning ambiguous problems into architecture — and that hasn't changed.",
    toc: [
      { id: 'the-misconception',      label: 'The Misconception' },
      { id: 'what-engineers-actually-do', label: 'What Engineers Actually Do' },
      { id: 'code-is-cheap',          label: 'Code Is Cheap, Architecture Isn\'t' },
      { id: 'productivity-multiplier', label: 'LLMs as a Productivity Multiplier' },
      { id: 'advice-for-sdes',        label: 'Advice for SDEs Using LLMs' },
      { id: 'vibe-coding-myth',       label: 'The Vibe Coding Myth' },
      { id: 'looking-ahead',          label: 'Looking Ahead' },
    ],
    Content: LlmsHeavyLifting,
  },
]

export function getPost(slug) {
  return posts.find((p) => p.slug === slug)
}

export function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
