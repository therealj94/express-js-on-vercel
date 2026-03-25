type SkillLevel = 'beginner' | 'intermediate' | 'advanced'
type PricingModel = 'free' | 'paid' | 'freemium'
export type CategoryKey = 'design' | 'video' | 'apps' | 'images'

interface SkillResource {
  name: string
  description: string
  url?: string
  level: SkillLevel
  pricing: PricingModel
  type: 'tool' | 'course' | 'skill'
}

export interface SkillCategory {
  key: CategoryKey
  label: string
  description: string
  agentName: string
  systemPrompt: string
  resources: SkillResource[]
}

type SkillsData = Record<CategoryKey, SkillCategory>

export const skillsData: SkillsData = {
  design: {
    key: 'design',
    label: 'Design',
    description: 'UI/UX and graphic design tools, courses, and skills',
    agentName: 'Designa',
    systemPrompt: `You are Designa, an expert creative design mentor. You specialize in UI/UX design, graphic design, typography, color theory, and design systems. You help people learn Figma, Adobe tools, and design principles. You give practical, actionable advice with real examples. Keep answers concise and focused. When recommending tools or courses, explain why they are the best choice for the user's level.`,
    resources: [
      {
        name: 'Figma',
        description: 'Collaborative UI/UX design tool used by most product teams worldwide',
        url: 'https://figma.com',
        level: 'beginner',
        pricing: 'freemium',
        type: 'tool',
      },
      {
        name: 'Adobe Illustrator',
        description: 'Industry-standard vector graphics editor for logos, icons, and illustrations',
        url: 'https://adobe.com/products/illustrator.html',
        level: 'intermediate',
        pricing: 'paid',
        type: 'tool',
      },
      {
        name: 'Google UX Design Certificate',
        description: 'Beginner-friendly UX design program covering research, wireframing, and prototyping',
        url: 'https://coursera.org/professional-certificates/google-ux-design',
        level: 'beginner',
        pricing: 'paid',
        type: 'course',
      },
      {
        name: 'Refactoring UI',
        description: 'Practical guide to making UIs look great — written by the creators of Tailwind CSS',
        url: 'https://refactoringui.com',
        level: 'intermediate',
        pricing: 'paid',
        type: 'course',
      },
      {
        name: 'Color Theory',
        description: 'Understanding hue, saturation, contrast, and how to build effective color palettes',
        level: 'beginner',
        pricing: 'free',
        type: 'skill',
      },
      {
        name: 'Web Accessibility (WCAG)',
        description: 'Designing inclusive products that meet WCAG 2.1 accessibility standards',
        url: 'https://www.w3.org/WAI/standards-guidelines/wcag/',
        level: 'intermediate',
        pricing: 'free',
        type: 'skill',
      },
    ],
  },
  video: {
    key: 'video',
    label: 'Video',
    description: 'Video editing, motion graphics, and content creation tools and courses',
    agentName: 'Motionix',
    systemPrompt: `You are Motionix, an expert video production and motion graphics mentor. You specialize in video editing, color grading, motion design, storytelling, and content creation. You help people master DaVinci Resolve, Adobe Premiere, After Effects, and CapCut. You give practical advice for all skill levels, from short-form social content to professional film editing. Keep answers concise and focused.`,
    resources: [
      {
        name: 'DaVinci Resolve',
        description: 'Professional-grade video editing and color grading software with a powerful free tier',
        url: 'https://blackmagicdesign.com/products/davinciresolve',
        level: 'beginner',
        pricing: 'freemium',
        type: 'tool',
      },
      {
        name: 'Adobe Premiere Pro',
        description: 'Industry-standard timeline-based video editor used in film and broadcast',
        url: 'https://adobe.com/products/premiere.html',
        level: 'intermediate',
        pricing: 'paid',
        type: 'tool',
      },
      {
        name: 'Adobe After Effects',
        description: 'Leading tool for motion graphics, VFX compositing, and animated titles',
        url: 'https://adobe.com/products/aftereffects.html',
        level: 'advanced',
        pricing: 'paid',
        type: 'tool',
      },
      {
        name: 'CapCut',
        description: 'Easy-to-use mobile and desktop video editor popular for short-form content',
        url: 'https://capcut.com',
        level: 'beginner',
        pricing: 'freemium',
        type: 'tool',
      },
      {
        name: 'Motion Design School',
        description: 'Specialized courses for motion graphics and animation using After Effects',
        url: 'https://motiondesign.school',
        level: 'intermediate',
        pricing: 'paid',
        type: 'course',
      },
      {
        name: 'Storytelling and Pacing',
        description: 'Editing rhythm, narrative arc, and visual storytelling principles for compelling videos',
        level: 'beginner',
        pricing: 'free',
        type: 'skill',
      },
    ],
  },
  apps: {
    key: 'apps',
    label: 'Apps',
    description: 'Web and mobile app development tools, frameworks, and learning resources',
    agentName: 'Codexa',
    systemPrompt: `You are Codexa, an expert software development mentor. You specialize in web and mobile app development, covering HTML/CSS, JavaScript, TypeScript, React, Node.js, Flutter, and REST APIs. You help beginners get started and guide intermediate developers to level up. You give clear, practical code-oriented advice. When suggesting learning resources, prioritize free options unless the user has a specific need. Keep answers concise and focused.`,
    resources: [
      {
        name: 'VS Code',
        description: 'The most popular free code editor, with a rich extension ecosystem',
        url: 'https://code.visualstudio.com',
        level: 'beginner',
        pricing: 'free',
        type: 'tool',
      },
      {
        name: 'React',
        description: 'The dominant JavaScript library for building interactive web UIs',
        url: 'https://react.dev',
        level: 'intermediate',
        pricing: 'free',
        type: 'tool',
      },
      {
        name: 'Flutter',
        description: "Google's UI toolkit for building cross-platform mobile, web, and desktop apps from one codebase",
        url: 'https://flutter.dev',
        level: 'intermediate',
        pricing: 'free',
        type: 'tool',
      },
      {
        name: 'The Odin Project',
        description: 'Free, open-source full-stack web development curriculum from HTML to Node.js',
        url: 'https://theodinproject.com',
        level: 'beginner',
        pricing: 'free',
        type: 'course',
      },
      {
        name: 'freeCodeCamp',
        description: 'Free certifications covering responsive design, JavaScript, APIs, and more',
        url: 'https://freecodecamp.org',
        level: 'beginner',
        pricing: 'free',
        type: 'course',
      },
      {
        name: 'REST API Design',
        description: 'Principles for designing clean, consistent, and versioned HTTP APIs',
        level: 'intermediate',
        pricing: 'free',
        type: 'skill',
      },
    ],
  },
  images: {
    key: 'images',
    label: 'Images',
    description: 'Professional photography, photo editing, and AI image generation tools and courses',
    agentName: 'Imaginia',
    systemPrompt: `You are Imaginia, an expert visual art and AI image generation mentor. You specialize in photography, photo editing, AI image generation with tools like Midjourney, Stable Diffusion, and Adobe Firefly, and prompt engineering for visual AI. You help people create stunning professional-quality images whether through a camera or AI tools. Keep answers concise and focused. Give specific, actionable tips for prompts, settings, and techniques.`,
    resources: [
      {
        name: 'Adobe Lightroom',
        description: 'Industry-standard photo organization and non-destructive editing software',
        url: 'https://adobe.com/products/photoshop-lightroom.html',
        level: 'beginner',
        pricing: 'paid',
        type: 'tool',
      },
      {
        name: 'Midjourney',
        description: 'Leading AI image generator producing highly artistic, photorealistic results via Discord',
        url: 'https://midjourney.com',
        level: 'beginner',
        pricing: 'paid',
        type: 'tool',
      },
      {
        name: 'Adobe Firefly',
        description: "Adobe's generative AI image tool integrated into Photoshop and Illustrator",
        url: 'https://firefly.adobe.com',
        level: 'beginner',
        pricing: 'freemium',
        type: 'tool',
      },
      {
        name: 'Stable Diffusion (Automatic1111)',
        description: 'Open-source AI image generation you can run locally with full control over models',
        url: 'https://github.com/AUTOMATIC1111/stable-diffusion-webui',
        level: 'advanced',
        pricing: 'free',
        type: 'tool',
      },
      {
        name: 'Photography Masterclass (Udemy)',
        description: 'Comprehensive beginner course covering camera settings, composition, and lighting',
        url: 'https://udemy.com/course/photography-masterclass-complete-guide-to-photography/',
        level: 'beginner',
        pricing: 'paid',
        type: 'course',
      },
      {
        name: 'Prompt Engineering for Images',
        description: 'Crafting effective text prompts to control style, composition, and quality in AI image tools',
        level: 'beginner',
        pricing: 'free',
        type: 'skill',
      },
    ],
  },
}

export const VALID_CATEGORIES = Object.keys(skillsData) as CategoryKey[]
