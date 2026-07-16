function booleanStates(keys) {
  return Array.from({ length: 2 ** keys.length }, (_, mask) => Object.fromEntries(
    keys.map((key, index) => [key, Boolean(mask & (1 << index))]),
  ))
}

/** Extract every code-rendered text variant without executing a state action. */
export function buildSimulatorContentPack(scenario, stateKeys, mechanicsVersion = 1) {
  const states = booleanStates(stateKeys)
  return {
    scenarioKey: scenario.id,
    mechanicsVersion,
    nodes: Object.entries(scenario.nodes).map(([id, node]) => {
      const texts = new Set(states.map(state => typeof node.text === 'function' ? node.text(state) : node.text))
      const transitions = new Map()
      for (const state of states) {
        const choices = typeof node.choices === 'function' ? node.choices(state) : node.choices
        for (const choice of choices) {
          const labels = transitions.get(choice.contentId) ?? new Set()
          labels.add(typeof choice.text === 'function' ? choice.text(state) : choice.text)
          transitions.set(choice.contentId, labels)
        }
      }
      return {
        id,
        icon: node.icon,
        texts: [...texts].map(source => ({ source, value: source })),
        ...(node.info ? { info: node.info } : {}),
        transitions: [...transitions].map(([slot, labels]) => ({
          slot, labels: [...labels].map(source => ({ source, value: source })),
        })),
      }
    }),
  }
}

function replaceVariant(variants, source) {
  return variants.find(variant => variant.source === source)?.value ?? source
}

/** Apply presentation content while mechanics/actions remain code-owned. */
export function applySimulatorContent(scenario, pack, allowedTargets) {
  if (pack.scenarioKey !== scenario.id || pack.mechanicsVersion !== 1) return scenario
  const contentNodes = new Map(pack.nodes.map(node => [node.id, node]))
  const nodes = Object.fromEntries(Object.entries(scenario.nodes).map(([id, node]) => {
    const content = contentNodes.get(id)
    if (!content) return [id, node]
    const wrapChoices = choices => choices.map(choice => {
      const authored = content.transitions.find(transition => transition.slot === choice.contentId)
      if (!authored) return choice
      const targetAllowed = authored.target && (allowedTargets[`${id}.${choice.contentId}`] ?? []).includes(authored.target)
      return {
        ...choice,
        text: state => replaceVariant(authored.labels, typeof choice.text === 'function' ? choice.text(state) : choice.text),
        next: targetAllowed ? authored.target : choice.next,
      }
    })
    return [id, {
      ...node,
      icon: content.icon,
      text: state => replaceVariant(content.texts, typeof node.text === 'function' ? node.text(state) : node.text),
      info: content.info,
      choices: typeof node.choices === 'function'
        ? state => wrapChoices(node.choices(state))
        : wrapChoices(node.choices),
    }]
  }))
  return { ...scenario, nodes }
}
