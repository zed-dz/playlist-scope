// Visualization generators. For each format we ask Claude to return a JSON
// document describing the visualization, then the Visualize tab renders it.
//
// Keeping the prompts + schemas in one place so renderers stay dumb.

import { callClaude } from './api.js';

export const FORMATS = [
  {
    id: 'mindmap',
    label: 'Mindmap',
    icon: 'git',
    blurb: 'Branching tree of ideas radiating from the central topic.',
  },
  {
    id: 'illustration',
    label: 'Illustration',
    icon: 'sparkles',
    blurb: 'Visual infographic — colored cards with emoji and one-liners.',
  },
  {
    id: 'workbook',
    label: 'Workbook',
    icon: 'edit',
    blurb: 'Interactive exercises, prompts, and reflection space.',
  },
  {
    id: 'guidebook',
    label: 'Guidebook',
    icon: 'book',
    blurb: 'Chapter-by-chapter explainer with key points and takeaways.',
  },
  {
    id: 'playbook',
    label: 'Playbook',
    icon: 'target',
    blurb: 'Tactical plays — when to use them, how, and pitfalls.',
  },
  {
    id: 'steps',
    label: 'Step-by-step',
    icon: 'list',
    blurb: 'Numbered linear path from start to finish.',
  },
];

const SCHEMAS = {
  mindmap: `{
  "title": "central topic — short",
  "subtitle": "one-line framing",
  "branches": [
    {
      "label": "main branch label",
      "color": "amber|blue|green|purple|pink|cyan",
      "children": [
        { "label": "sub-idea", "children": [{ "label": "leaf detail" }] }
      ]
    }
  ]
}`,
  illustration: `{
  "title": "headline",
  "subtitle": "supporting line",
  "sections": [
    { "emoji": "single emoji", "heading": "short heading", "body": "1-2 sentences", "color": "amber|blue|green|purple|pink|cyan" }
  ]
}`,
  workbook: `{
  "title": "workbook title",
  "intro": "1-2 sentence framing for the learner",
  "modules": [
    {
      "title": "module title",
      "lesson": "2-4 sentence explanation in plain language",
      "key_terms": ["term 1", "term 2"],
      "exercises": [
        { "type": "reflect|fill_blank|quiz", "prompt": "the question", "hint": "optional", "answer": "optional for quiz" }
      ]
    }
  ]
}`,
  guidebook: `{
  "title": "guidebook title",
  "subtitle": "what the reader will learn",
  "chapters": [
    {
      "title": "chapter title",
      "intro": "2-3 sentences setting up the chapter",
      "key_points": ["bullet 1", "bullet 2", "bullet 3"],
      "example": "concrete example from the video",
      "takeaway": "the one thing to remember"
    }
  ]
}`,
  playbook: `{
  "title": "playbook title",
  "subtitle": "who this is for",
  "plays": [
    {
      "name": "play name",
      "when": "the trigger / situation",
      "how": ["step 1", "step 2", "step 3"],
      "outcome": "what success looks like",
      "pitfalls": ["watch out for X"]
    }
  ]
}`,
  steps: `{
  "title": "guide title",
  "goal": "what you'll have at the end",
  "prerequisites": ["thing 1", "thing 2"],
  "steps": [
    { "title": "step title", "what": "what you do (1-2 sentences)", "why": "why it matters", "tip": "optional pro tip" }
  ]
}`,
};

const INSTRUCTIONS = {
  mindmap: 'Map the conceptual structure of the video as a tree. The title is the central topic. Top-level branches are the 4-7 main themes. Each branch has 2-5 child nodes; some children may have 1-3 leaf details. Keep every label tight (max 6 words). Use color to visually distinguish branches.',
  illustration: 'Compress the video into a visual infographic with 5-8 sections. Each section gets one emoji, a short heading, and 1-2 sentences of body copy. Pick varied colors. Aim for stand-alone clarity — someone glancing at this should grasp the gist without watching.',
  workbook: 'Convert the video into a self-paced learning workbook. Create 3-5 modules. Each module has a short lesson, 2-4 key terms drawn from the transcript, and 2-3 exercises (mix reflect prompts, fill-in-the-blank, and quiz questions). Exercises should make the learner actively engage with the material.',
  guidebook: 'Rewrite the video as a structured guidebook with 4-7 chapters. Each chapter has an intro, 3-5 key points, a concrete example (drawn from what the speaker actually said), and a one-line takeaway. Write in clear, accessible prose — like a great teacher walking a student through the material.',
  playbook: 'Reformat the video as an action playbook. Extract 4-7 distinct "plays" — actionable patterns, frameworks, or tactics the speaker shared. For each play, capture when to use it, the step-by-step how, the expected outcome, and 1-2 common pitfalls. This is for someone who wants to apply the ideas, not just understand them.',
  steps: 'Distill the video into a linear step-by-step guide of 5-10 steps that someone could follow to achieve the same outcome the video describes. Each step has a what, a why, and optionally a tip. List any prerequisites up front.',
};

function buildPrompt({ format, video, transcript, arabic, lang }) {
  const schema = SCHEMAS[format];
  const instr = INSTRUCTIONS[format];
  const langNote = arabic
    ? '\nIMPORTANT: All natural-language fields (titles, headings, body, prompts, etc.) must be in Arabic (العربية). Keep proper nouns, tool names, and URLs in their original form. JSON keys MUST stay in English.'
    : (lang && lang !== 'en'
      ? `\nIMPORTANT: All natural-language text fields should be in the same language as the transcript (${lang}). JSON keys MUST stay in English.`
      : '');
  return `You are a learning designer. Convert the video below into a ${format} visualization. ${instr}${langNote}

Video: "${video.title}"
Channel: ${video.uploader}
Duration: ${video.duration_hms}

Return ONLY valid JSON matching exactly this schema (no markdown fences, no prose before or after):

${schema}

Transcript:
${transcript}`;
}

export async function generateVisualization({ format, video, transcript, lang, arabic, signal }) {
  if (!SCHEMAS[format]) throw new Error(`Unknown format: ${format}`);
  const trimmed = transcript.length > 70000 ? transcript.slice(0, 70000) + '\n...[truncated]' : transcript;
  const raw = await callClaude({
    prompt: buildPrompt({ format, video, transcript: trimmed, arabic, lang }),
    maxTokens: 4000,
    signal,
  });

  let json = raw.trim();
  const fence = json.match(/```(?:json)?\n([\s\S]*?)\n```/);
  if (fence) json = fence[1].trim();
  const objStart = json.indexOf('{');
  const objEnd = json.lastIndexOf('}');
  if (objStart >= 0 && objEnd > objStart) json = json.slice(objStart, objEnd + 1);
  try {
    return JSON.parse(json);
  } catch (e) {
    throw new Error('Model returned unparseable JSON: ' + e.message.slice(0, 120));
  }
}

// Convert a generated visualization back into Markdown for export.
export function visualizationToMarkdown(format, data, video) {
  const header = `# ${data.title || video.title}\n\n*From: ${video.title} — ${video.uploader}*\n\n${data.subtitle || data.intro || ''}\n`;
  switch (format) {
    case 'mindmap':
      return header + '\n' + renderMindmapMD(data.branches || [], 0);
    case 'illustration':
      return header + '\n' + (data.sections || []).map(s => `## ${s.emoji || ''} ${s.heading}\n\n${s.body}\n`).join('\n');
    case 'workbook':
      return header + '\n' + (data.modules || []).map((m, i) => {
        const ex = (m.exercises || []).map((e, j) => `${j + 1}. **[${e.type}]** ${e.prompt}${e.hint ? `\n   _Hint: ${e.hint}_` : ''}${e.answer ? `\n   _Answer: ${e.answer}_` : ''}`).join('\n');
        const terms = (m.key_terms || []).map(t => `\`${t}\``).join(', ');
        return `## Module ${i + 1}: ${m.title}\n\n${m.lesson}\n\n${terms ? `**Key terms:** ${terms}\n\n` : ''}### Exercises\n\n${ex}\n`;
      }).join('\n');
    case 'guidebook':
      return header + '\n' + (data.chapters || []).map((c, i) =>
        `## Chapter ${i + 1}: ${c.title}\n\n${c.intro}\n\n${(c.key_points || []).map(p => `- ${p}`).join('\n')}\n\n${c.example ? `> ${c.example}\n\n` : ''}**Takeaway:** ${c.takeaway}\n`
      ).join('\n');
    case 'playbook':
      return header + '\n' + (data.plays || []).map((p, i) =>
        `## Play ${i + 1}: ${p.name}\n\n**When:** ${p.when}\n\n**How:**\n\n${(p.how || []).map((s, j) => `${j + 1}. ${s}`).join('\n')}\n\n**Outcome:** ${p.outcome}\n\n${(p.pitfalls || []).length ? `**Pitfalls:**\n\n${p.pitfalls.map(x => `- ${x}`).join('\n')}\n` : ''}`
      ).join('\n');
    case 'steps': {
      const prereq = (data.prerequisites || []).length ? `## Prerequisites\n\n${data.prerequisites.map(p => `- ${p}`).join('\n')}\n\n` : '';
      const goal = data.goal ? `**Goal:** ${data.goal}\n\n` : '';
      return header + '\n' + goal + prereq + (data.steps || []).map((s, i) =>
        `### Step ${i + 1}: ${s.title}\n\n${s.what}\n\n_Why:_ ${s.why}${s.tip ? `\n\n**Tip:** ${s.tip}` : ''}\n`
      ).join('\n');
    }
    default:
      return header;
  }
}

function renderMindmapMD(branches, depth) {
  return branches.map(b => {
    const indent = '  '.repeat(depth);
    const line = `${indent}- ${b.label}`;
    if (b.children && b.children.length) return line + '\n' + renderMindmapMD(b.children, depth + 1);
    return line;
  }).join('\n');
}
