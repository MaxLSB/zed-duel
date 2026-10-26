// Keep live controls mounted while room snapshots update their surrounding text.
// Replacing innerHTML closes an opponent's open champion picker on every pick/ready change.
export function updateOverlay(element: HTMLElement, content: string) {
  const template = document.createElement('template');
  template.innerHTML = content;
  reconcile(element, template.content);
  element.classList.toggle('hidden', !content);
}

function reconcile(current: Node, next: Node) {
  const children = [...next.childNodes];
  for (let i = 0; i < children.length; i++) {
    const incoming = children[i];
    const existing = current.childNodes[i];
    if (!existing) current.appendChild(incoming.cloneNode(true));
    else if (existing.nodeType !== incoming.nodeType || existing.nodeName !== incoming.nodeName)
      current.replaceChild(incoming.cloneNode(true), existing);
    else if (existing instanceof Element && incoming instanceof Element) {
      const previousPick =
        existing instanceof HTMLSelectElement
          ? existing.querySelector('option[selected]')?.getAttribute('value')
          : null;
      for (const attribute of [...existing.attributes])
        if (!incoming.hasAttribute(attribute.name)) existing.removeAttribute(attribute.name);
      for (const attribute of [...incoming.attributes])
        if (existing.getAttribute(attribute.name) !== attribute.value)
          existing.setAttribute(attribute.name, attribute.value);
      reconcile(existing, incoming);
      if (existing instanceof HTMLSelectElement) {
        const nextPick = incoming.querySelector('option[selected]')?.getAttribute('value');
        if (nextPick && nextPick !== previousPick) existing.value = nextPick;
      }
    } else if (existing.nodeValue !== incoming.nodeValue) existing.nodeValue = incoming.nodeValue;
  }
  while (current.childNodes.length > children.length) current.removeChild(current.lastChild!);
}
