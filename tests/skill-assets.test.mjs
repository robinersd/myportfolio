import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { profile, skillIcons, skillPreviews } from '../site/assets/data.js';
import { renderStaggeredSkills } from '../site/assets/staggered-skills.js';

test('every displayed skill has a local icon and its photo viewer has a real preview asset', async () => {
  const rendered = renderStaggeredSkills(profile.skills, skillPreviews, skillIcons, (value) =>
    String(value),
  );
  assert.equal(new Set(profile.skills).size, profile.skills.length);
  for (const skill of profile.skills) {
    assert.ok(skillIcons[skill], `${skill} has an icon`);
    const icon = await fs.readFile(
      new URL(`../site/assets/icons/${skillIcons[skill]}.svg`, import.meta.url),
      'utf8',
    );
    assert.match(icon, /<svg\b/);
    const preview = skillPreviews[skill];
    assert.ok(preview?.alt && preview?.image, `${skill} has a labelled image`);
    const bytes = await fs.readFile(new URL(`../site${preview.image}`, import.meta.url));
    assert.ok(bytes.length > 100, `${skill} image is nonempty`);
    assert.ok(rendered.includes(`data-skill="${skill}"`));
    assert.ok(rendered.includes(preview.image));
  }
});

test('Supabase, Node.js and Vercel each have their own optimized image and viewer trigger', () => {
  const added = ['Supabase', 'Node.js', 'Vercel'];
  assert.equal(new Set(added.map((name) => skillPreviews[name]?.image)).size, added.length);
  for (const name of added) {
    assert.ok(profile.skills.includes(name));
    const markup = renderStaggeredSkills([name], skillPreviews, skillIcons, (value) =>
      String(value),
    );
    assert.match(markup, /aria-controls="robiner-skill-preview"/);
    assert.match(markup, /class="staggered-skill-image"/);
    assert.match(skillPreviews[name].image, /\.webp$/);
  }
});
