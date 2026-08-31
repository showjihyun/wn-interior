const progress = document.querySelector('.page-progress')
const sectionLinks = [...document.querySelectorAll('.section-nav a')]
const sections = sectionLinks
  .map((link) => document.querySelector(link.getAttribute('href')))
  .filter(Boolean)

function updatePageState() {
  const root = document.documentElement
  const total = root.scrollHeight - root.clientHeight
  const ratio = total > 0 ? root.scrollTop / total : 0
  if (progress) progress.style.transform = `scaleX(${Math.min(1, Math.max(0, ratio))})`

  let active = sections[0]
  for (const section of sections) {
    if (section.getBoundingClientRect().top <= 150) active = section
  }
  sectionLinks.forEach((link) => {
    const selected = active && link.getAttribute('href') === `#${active.id}`
    link.classList.toggle('is-active', selected)
    if (selected) link.setAttribute('aria-current', 'location')
    else link.removeAttribute('aria-current')
  })
}

document.querySelectorAll('[data-year]').forEach((node) => {
  node.textContent = new Date().getFullYear().toString()
})

addEventListener('scroll', updatePageState, { passive: true })
addEventListener('resize', updatePageState)
updatePageState()
