// Shared by the chat interface and server; prose from the AI cannot unlock a resume.
export function isResumeActivation(content) {
  return typeof content === 'string' && /^activate\s+the\s+resume[.!]*$/i.test(content.trim());
}

export function isResumeActivationQuestion(content) {
  if (typeof content !== 'string') return false;
  const question = content.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
  if (!/\bresume\b/.test(question)) return false;
  if (
    /\b(?:do not|don't|did not|didn't|never|stop)\b.{0,24}\b(?:ask|tell|show|send|give|explain|reveal|mention)\b|\b(?:wag|huwag)\b/.test(
      question,
    )
  )
    return false;
  const activation =
    /\b(?:activate|activation|activating|activated|iactivate|maactivate|unlock|unlocking|unlocked)\b/.test(
      question,
    );
  const request =
    /\b(?:how|paano|pano|papaano|help|tulong|instructions?|steps?|guide|command)\b/.test(
      question,
    ) ||
    /\b(?:can|could|please|pwede|puwede)\b.{0,40}\b(?:activate|iactivate|maactivate|unlock)\b/.test(
      question,
    ) ||
    /\b(?:what|ano|anong)\b.{0,40}\b(?:type|send|say|sabihin|itype|i-type|isend|i-send)\b/.test(
      question,
    );
  return activation && request;
}
