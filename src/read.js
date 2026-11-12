// Turns the browser's accessibility tree into the sequence of announcements a
// screen reader user would hear when reading the page from top to bottom.

const LANDMARKS = {
  navigation: 'navigation',
  main: 'main',
  banner: 'banner',
  contentinfo: 'content information',
  complementary: 'complementary',
  search: 'search',
};

const SKIP = new Set(['InlineTextBox', 'LineBreak', 'ListMarker', 'separator', 'splitter']);

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

function prop(node, name) {
  const p = node.properties?.find((x) => x.name === name);
  return p?.value?.value;
}

function join(...parts) {
  return parts.filter(Boolean).join(', ');
}

/**
 * @param {Array} nodes  Result of CDP Accessibility.getFullAXTree
 * @returns {Array<{text:string, kind:string, issue?:string, backendNodeId?:number}>}
 */
export function announcements(nodes) {
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  const root = nodes.find((n) => n.role?.value === 'RootWebArea') ?? nodes[0];
  const out = [];
  const seen = new Set();

  const children = (node) => (node.childIds ?? []).map((id) => byId.get(id)).filter(Boolean);
  const emit = (node, kind, text, issue) => {
    out.push({ kind, text, ...(issue ? { issue } : {}), backendNodeId: node.backendDOMNodeId });
  };
  const count = (node, role) => {
    let n = 0;
    const walk = (x) => {
      for (const c of children(x)) {
        if (!c.ignored && c.role?.value === role) n++;
        else if (c.ignored || c.role?.value === 'generic' || c.role?.value === 'none') walk(c);
      }
    };
    walk(node);
    return n;
  };

  const visit = (node) => {
    if (!node || seen.has(node.nodeId)) return;
    seen.add(node.nodeId);
    const recurse = () => children(node).forEach(visit);
    if (node.ignored) return recurse();

    const role = node.role?.value ?? '';
    // A tooltip (title attribute) is announced when there is no other name.
    const name = clean(node.name?.value) || clean(node.description?.value);
    if (SKIP.has(role)) return;

    switch (role) {
      case 'RootWebArea':
        emit(node, 'page', name ? `${name}, web content` : 'web content', name ? undefined : 'page has no title');
        return recurse();

      case 'StaticText':
        // Separators such as "|" carry no words; leave them out.
        if (/[\p{L}\p{N}]/u.test(name)) emit(node, 'text', name);
        return;

      case 'heading': {
        const level = prop(node, 'level');
        emit(node, 'heading', join(`heading level ${level ?? 2}`, name), name ? undefined : 'empty heading');
        return;
      }

      case 'link':
        emit(node, 'link', join('link', name), name ? undefined : 'link has no name');
        return;

      case 'button': {
        const expanded = prop(node, 'expanded');
        const pressed = prop(node, 'pressed');
        emit(
          node,
          'button',
          join(
            'button',
            name,
            prop(node, 'disabled') ? 'dimmed' : '',
            expanded === true ? 'expanded' : expanded === false ? 'collapsed' : '',
            pressed === 'true' || pressed === true ? 'pressed' : '',
          ),
          name ? undefined : 'button has no name',
        );
        return;
      }

      case 'image':
      case 'img':
      case 'graphics-document':
        emit(node, 'image', join('image', name), name ? undefined : 'image has no description');
        return;

      case 'textbox':
      case 'searchbox':
      case 'spinbutton': {
        const value = clean(node.value?.value);
        emit(node, 'field', join(role === 'searchbox' ? 'search field' : 'edit text', name, value), name ? undefined : 'field has no label');
        return;
      }

      case 'combobox':
      case 'listbox':
        emit(node, 'field', join(role === 'combobox' ? 'combo box' : 'list box', name, clean(node.value?.value)), name ? undefined : 'field has no label');
        return;

      case 'checkbox':
      case 'switch': {
        const checked = prop(node, 'checked');
        const state = role === 'switch' ? (checked === 'true' ? 'on' : 'off') : checked === 'true' ? 'checked' : checked === 'mixed' ? 'mixed' : 'unchecked';
        emit(node, 'field', join(role, name, state), name ? undefined : 'field has no label');
        return;
      }

      case 'radio':
        emit(node, 'field', join('radio button', name, prop(node, 'checked') === 'true' ? 'selected' : 'not selected'), name ? undefined : 'field has no label');
        return;

      case 'slider':
        emit(node, 'field', join('slider', name, clean(node.value?.value)), name ? undefined : 'field has no label');
        return;

      case 'tab':
        emit(node, 'control', join('tab', name, prop(node, 'selected') ? 'selected' : ''));
        return;

      case 'menuitem':
      case 'option':
        emit(node, 'control', join(role === 'menuitem' ? 'menu item' : 'option', name));
        return;

      case 'list': {
        const n = count(node, 'listitem');
        emit(node, 'list', `list, ${n} item${n === 1 ? '' : 's'}`);
        return recurse();
      }

      case 'table':
      case 'grid': {
        const n = count(node, 'row') || children(node).reduce((a, c) => a + count(c, 'row'), 0);
        emit(node, 'table', join('table', name, n ? `${n} row${n === 1 ? '' : 's'}` : ''));
        return recurse();
      }

      case 'dialog':
      case 'alertdialog':
        emit(node, 'landmark', join(name, 'dialog'));
        return recurse();

      case 'alert':
      case 'status':
        emit(node, 'landmark', role);
        return recurse();

      case 'figure':
        if (name) emit(node, 'landmark', join('figure', name));
        return recurse();

      case 'Iframe':
      case 'IframePresentational':
        emit(node, 'landmark', join('frame', name), name ? undefined : 'frame has no title');
        return recurse();

      case 'Video':
      case 'Audio':
        emit(node, 'control', join(role.toLowerCase(), name));
        return;

      case 'region':
      case 'form':
        if (name) emit(node, 'landmark', `${name}, ${role}`);
        return recurse();

      default:
        if (LANDMARKS[role]) emit(node, 'landmark', join(name, `${LANDMARKS[role]} landmark`));
        return recurse();
    }
  };

  visit(root);
  return out;
}

/** Page-level problems a listener would run into, worked out from the announcements. */
export function audit(items) {
  const tally = (issue) => items.filter((i) => i.issue === issue).length;
  const headings = items.filter((i) => i.kind === 'heading');
  const levels = headings.map((h) => Number(/level (\d)/.exec(h.text)?.[1] ?? 0));
  let skips = 0;
  for (let i = 1; i < levels.length; i++) if (levels[i] > levels[i - 1] + 1) skips++;

  const findings = [];
  const add = (n, one, many) => {
    if (n > 0) findings.push(n === 1 ? one : many.replace('#', n));
  };
  add(tally('image has no description'), '1 image has no description', '# images have no description');
  add(tally('link has no name'), '1 link has no name', '# links have no name');
  add(tally('button has no name'), '1 button has no name', '# buttons have no name');
  add(tally('field has no label'), '1 form field has no label', '# form fields have no label');
  add(tally('empty heading'), '1 heading is empty', '# headings are empty');
  add(tally('frame has no title'), '1 frame has no title', '# frames have no title');
  if (tally('page has no title')) findings.push('The page has no title');
  if (!headings.length) findings.push('There are no headings to jump between');
  else if (!levels.includes(1)) findings.push('There is no level 1 heading');
  add(skips, '1 heading skips a level', '# headings skip a level');
  if (!items.some((i) => i.kind === 'landmark' && /main landmark$/.test(i.text))) {
    findings.push('There is no main landmark to skip to');
  }

  const words = items.reduce((n, i) => n + i.text.split(' ').length, 0);
  return {
    total: items.length,
    words,
    headings: headings.length,
    links: items.filter((i) => i.kind === 'link').length,
    findings,
  };
}
