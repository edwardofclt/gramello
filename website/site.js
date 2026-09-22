// Close other FAQ answers when opening one. Native details work without JavaScript.
const questions = document.querySelectorAll('.faqs details');
for (const question of questions) {
  question.addEventListener('toggle', () => {
    if (!question.open) return;
    for (const other of questions) if (other !== question) other.open = false;
  });
}
