import { useMemo } from 'react'
import { Picker, Item } from '@swc-react/picker'
import { ActionButton } from '@swc-react/action-button'
import { useGeneration } from '../../contexts/generation-context'
import { getActiveDocumentInfo } from '../../services/photoshop-layer'
import { resolveStyleSampler, SAMPLER_OPTIONS, SCHEDULER_OPTIONS } from '../../utils/sampler-utils'

const MIN_SIZE = 64

function clampMin(value: number, min: number): number {
  return value < min ? min : value
}

export function GenerationSettings() {
  const {
    batchSize,
    setBatchSize,
    seed,
    fixedSeed,
    setSeed,
    setFixedSeed,
    randomizeSeed,
    width,
    height,
    setWidth,
    setHeight,
    steps,
    cfgScale,
    setSteps,
    setCfgScale,
    sampler,
    scheduler,
    setSampler,
    setScheduler,
    useStyleDefaults,
    setUseStyleDefaults,
    style,
  } = useGeneration()

  const styleDefaults = useMemo(() => {
    if (!style) return null
    const resolved = resolveStyleSampler(style.sampler)
    return {
      steps: style.steps,
      cfgScale: style.cfg_scale,
      sampler: resolved.sampler,
      scheduler: resolved.scheduler,
    }
  }, [style])

  const lockToStyle = useStyleDefaults && !!styleDefaults
  const displaySteps = lockToStyle ? styleDefaults.steps : steps
  const displayCfg = lockToStyle ? styleDefaults.cfgScale : cfgScale
  const displaySampler = lockToStyle ? styleDefaults.sampler : sampler
  const displayScheduler = lockToStyle ? styleDefaults.scheduler : scheduler

  const handleUseDocumentSize = () => {
    const doc = getActiveDocumentInfo()
    if (!doc) {
      alert('Please open a document first')
      return
    }
    setWidth(Math.round(doc.width))
    setHeight(Math.round(doc.height))
  }

  return (
    <div className="generation-settings">
      <div className="settings-row seed-row">
        <span className="settings-label">Seed</span>
        <input
          type="number"
          className="number-input"
          value={seed}
          onChange={e => {
            const next = parseInt(e.target.value, 10)
            if (Number.isFinite(next)) setSeed(next)
          }}
        />
        <label className="inline-toggle">
          <input
            type="checkbox"
            checked={fixedSeed}
            onChange={e => setFixedSeed(e.target.checked)}
          />
          <span>Fixed</span>
        </label>
        <ActionButton size="s" quiet onClick={randomizeSeed} title="Randomize seed">
          Random
        </ActionButton>
      </div>

      <div className="settings-row resolution-row">
        <span className="settings-label">Size</span>
        <input
          type="number"
          className="number-input"
          value={width}
          onChange={e => {
            const next = parseInt(e.target.value, 10)
            if (Number.isFinite(next)) setWidth(clampMin(next, MIN_SIZE))
          }}
        />
        <span className="settings-x">×</span>
        <input
          type="number"
          className="number-input"
          value={height}
          onChange={e => {
            const next = parseInt(e.target.value, 10)
            if (Number.isFinite(next)) setHeight(clampMin(next, MIN_SIZE))
          }}
        />
        <ActionButton size="s" quiet onClick={handleUseDocumentSize} title="Use document size">
          Use Doc
        </ActionButton>
      </div>

      <div className="settings-row batch-size-row">
        <sp-body size="XS">Batch</sp-body>
        <select value={batchSize} onChange={e => setBatchSize(parseInt(e.target.value, 10))}>
          {[1, 2, 3, 4, 5, 6, 7, 8].map(value => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
      </div>

      <div className="settings-row style-defaults-row">
        <label className="inline-toggle">
          <input
            type="checkbox"
            checked={useStyleDefaults}
            onChange={e => setUseStyleDefaults(e.target.checked)}
          />
          <span>Use style defaults</span>
        </label>
        {lockToStyle && styleDefaults && (
          <span className="settings-hint">
            Steps {styleDefaults.steps}, CFG {styleDefaults.cfgScale}, {styleDefaults.sampler}/{styleDefaults.scheduler}
          </span>
        )}
      </div>

      <div className={`settings-row sampler-row ${lockToStyle ? 'disabled' : ''}`}>
        <div className="settings-col">
          <Picker
            size="s"
            label="Sampler"
            value={displaySampler}
            change={e => setSampler(e.target.value as string)}
            disabled={lockToStyle}
            style={{ width: '100%' }}
          >
            {SAMPLER_OPTIONS.map(option => (
              <Item key={option} value={option}>{option}</Item>
            ))}
          </Picker>
        </div>
        <div className="settings-col">
          <Picker
            size="s"
            label="Scheduler"
            value={displayScheduler}
            change={e => setScheduler(e.target.value as string)}
            disabled={lockToStyle}
            style={{ width: '100%' }}
          >
            {SCHEDULER_OPTIONS.map(option => (
              <Item key={option} value={option}>{option}</Item>
            ))}
          </Picker>
        </div>
      </div>

      <div className={`settings-row steps-row ${lockToStyle ? 'disabled' : ''}`}>
        <span className="settings-label">Steps</span>
        <input
          type="number"
          className="number-input"
          value={displaySteps}
          disabled={lockToStyle}
          onChange={e => {
            const next = parseInt(e.target.value, 10)
            if (Number.isFinite(next)) setSteps(Math.max(1, next))
          }}
        />
        <span className="settings-label">CFG</span>
        <input
          type="number"
          className="number-input"
          value={displayCfg}
          step={0.1}
          disabled={lockToStyle}
          onChange={e => {
            const next = parseFloat(e.target.value)
            if (Number.isFinite(next)) setCfgScale(Math.max(0, next))
          }}
        />
      </div>
    </div>
  )
}
