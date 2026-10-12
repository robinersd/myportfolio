# Skill illustration generation

Built-in image_gen tool via the imagegen skill. The user approved generating code variants for seven skills. These are illustrative sample code images, not screenshots of implemented project source. Supplied tool pictures are preserved separately.

Current outputs: html.png, css.png, javascript.png, typescript.png and tailwind.png.

## Shared prompt

Use case: precise-object-edit. Edit the supplied Git terminal illustration. Change only the monitor to a dark VS Code editor for the named skill, with the exact filename and code below. Preserve the man, face, pose, hands, keyboard, chair, blue glow, background, perspective and framing. One landscape image, no collage or watermark. Render legible monospaced code with syntax highlighting and no unrelated terminal/document content.

## HTML (index.html)

```
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Robiner Portfolio</title>
</head>
<body>
  <main>
    <h1>Robiner</h1>
    <p>Welcome to my portfolio.</p>
    <a href="/projects">View projects</a>
  </main>
</body>
</html>
```

## CSS (styles.css)

```
.profile {
  display: grid;
  gap: 1rem;
  padding: 2rem;
  border-radius: 16px;
}
.button {
  background: #2563eb;
  color: white;
  transition: transform 200ms ease;
}
.button:hover {
  transform: translateY(-4px);
}
```

## JavaScript (main.js)

```
const button = document.querySelector('#theme');
let darkMode = false;

button.addEventListener('click', () => {
  darkMode = !darkMode;
  document.documentElement.dataset.theme =
    darkMode ? 'dark' : 'light';
});

const projects = ['AlagaTrack', 'StreetWear'];
projects.forEach(project => {
  console.log(project);
});
```

## TypeScript (projects.ts)

```
interface Project {
  name: string;
  year: number;
  featured: boolean;
}

const project: Project = {
  name: 'AlagaTrack',
  year: 2025,
  featured: true,
};

function getTitle(item: Project): string {
  return item.name;
}
```

## Tailwind CSS (Card.jsx)

```
export default function Card() {
  return (
    <article className="rounded-xl bg-slate-900 p-6">
      <h2 className="text-2xl font-bold text-white">
        Robiner Portfolio
      </h2>
      <p className="mt-3 text-slate-300">
        Building web experiences.
      </p>
      <button className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-white">
        View projects
      </button>
    </article>
  );
}
```

## Final Tailwind correction prompt

Use case: precise-object-edit. Edit target: this generated Tailwind skill illustration. Keep the same man, face, body, pose, hands, keyboard, chair, blue monitor glow, background, perspective and framing. Change ONLY the monitor content. Show a dark VS Code editor headed 'Tailwind CSS', file tab 'index.html'. The code must be large, clearly legible and COMPLETE with all closing tags. Use ONLY the following SIX lines of simple HTML using valid Tailwind classes, exact text, no other code, no truncation:
<div class="rounded-xl bg-slate-900 p-6">
  <h2 class="text-2xl font-bold text-white">Robiner</h2>
  <p class="mt-3 text-slate-300">My portfolio</p>
  <button class="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-white">
    View projects</button>
</div>
Leave generous blank editor space beneath the sixth line so code cannot be clipped. No added characters outside the monitor. One image, not a collage.
