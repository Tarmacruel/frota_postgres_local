import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import GuidedForm, { FormSection } from './GuidedForm'
import SearchableSelect from './SearchableSelect'
import MoneyInput from './MoneyInput'

function Example({ saved = vi.fn(), busy = false }) {
  const [name, setName] = useState('')
  const [choice, setChoice] = useState('')
  const [extra, setExtra] = useState(false)
  return <GuidedForm onSubmit={saved} busy={busy}>
    <FormSection title="Cadastro"><label>Nome<input required value={name} onChange={(e) => setName(e.target.value)} /></label><label>Observação<input aria-label="Observação" /></label></FormSection>
    <FormSection title="Destino"><label>Posto<SearchableSelect required ariaLabel="Posto" value={choice} options={[{ value: 'one', label: 'Posto um' }]} onChange={setChoice} /></label><label><input type="checkbox" checked={extra} onChange={(e) => setExtra(e.target.checked)} />Detalhar</label>{extra ? <label>Detalhe<input required aria-label="Detalhe" /></label> : null}</FormSection>
    <div className="actions-inline modal-actions"><button type="submit">Salvar</button><button type="button">Cancelar</button></div>
  </GuidedForm>
}

describe('GuidedForm', () => {
  it('keeps the first typed character through the native capture-to-change boundary', async () => {
    render(<Example />)
    const input = screen.getByLabelText('Nome')
    // Chromium can run a microtask between the root capture and bubble listeners.
    // Model that boundary before React receives the controlled field change.
    fireEvent.input(input, { target: { value: 'A' }, bubbles: false })
    await act(async () => { await Promise.resolve() })
    expect(input).toHaveValue('A')
    fireEvent.change(input)
    await waitFor(() => expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1'))
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.input(input, { target: { value: 'B' }, bubbles: false })
    await act(async () => { await Promise.resolve() })
    expect(input).toHaveValue('B')
    fireEvent.change(input)
    expect(input).toHaveValue('B')
  })
  it('marks every feedback and completed-step icon for the shared size rules', () => {
    render(<Example />)
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(screen.getByRole('alert').querySelector('svg')).toHaveClass('app-icon')
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Cadastro' } })
    expect(screen.getByRole('button', { name: 'Cadastro' }).querySelector('svg')).toHaveClass('app-icon')
  })
  it('shows real required progress and prevents continuing with a missing field', async () => {
    const saved = vi.fn()
    render(<Example saved={saved} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '2')
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Nome: preencha esta informação')
    expect(saved).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText(/Nome/), { target: { value: 'Veículo de teste' } })
    await waitFor(() => expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
  it('keeps native drafts and files mounted while moving between stages', () => {
    render(<Example />)
    fireEvent.change(screen.getByLabelText(/Nome/), { target: { value: 'Cadastro' } })
    fireEvent.change(screen.getByLabelText('Observação'), { target: { value: 'Rascunho preservado' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(screen.getByRole('button', { name: 'Posto' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar etapa' }))
    expect(screen.getByLabelText('Observação')).toHaveValue('Rascunho preservado')
  })
  it('validates custom required selects and submits only on the final stage', async () => {
    const saved = vi.fn((e) => e.preventDefault())
    render(<Example saved={saved} />)
    fireEvent.change(screen.getByLabelText(/Nome/), { target: { value: 'Cadastro' } })
    fireEvent.submit(screen.getByLabelText(/Nome/).closest('form'))
    expect(saved).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Posto: selecione uma opção')
    fireEvent.click(screen.getByRole('button', { name: 'Posto' }))
    fireEvent.click(screen.getByRole('button', { name: 'Posto um', exact: true }))
    await waitFor(() => expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2'))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(saved).toHaveBeenCalledTimes(1)
  })
  it('recomputes conditional required fields without discarding other data', () => {
    render(<Example />)
    fireEvent.change(screen.getByLabelText(/Nome/), { target: { value: 'Cadastro' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Detalhar' }))
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '3')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Detalhe: preencha esta informação')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Detalhar' }))
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '2')
    expect(screen.getByRole('alert')).not.toHaveTextContent('Detalhe:')
  })
  it('takes an error link to the required field in another stage', async () => {
    render(<Example />)
    fireEvent.change(screen.getByLabelText(/Nome/), { target: { value: 'Cadastro' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    fireEvent.change(screen.getByLabelText(/Nome/), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: /Nome.*preencha/ }))
    await waitFor(() => expect(screen.getByLabelText(/Nome/)).toHaveFocus())
    expect(screen.getByLabelText(/Nome/)).toBeVisible()
  })
  it('supports short single-page forms, zero, optional values and native constraints', () => {
    const saved = vi.fn()
    render(<GuidedForm onSubmit={saved}><label>Quantidade<input required type="number" min="0" defaultValue="0" /></label><label>Texto<input minLength={3} aria-label="Texto" /></label><div className="actions-inline"><button type="submit">Confirmar</button></div></GuidedForm>)
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1')
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(saved).toHaveBeenCalledTimes(1)
    fireEvent.change(screen.getByLabelText('Texto'), { target: { value: 'a' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(screen.getByRole('alert')).toHaveTextContent('use pelo menos 3 caracteres')
    expect(saved).toHaveBeenCalledTimes(1)
  })
  it('preserves server explanations, references and existing recovery actions', () => {
    render(<GuidedForm><div className="alert alert-error">Preço alterado (referência: abc)<button type="button">Atualizar preço</button></div></GuidedForm>)
    expect(screen.getByRole('alert')).toHaveTextContent('Preço alterado (referência: abc)')
    expect(screen.getByRole('button', { name: 'Atualizar preço' })).toBeEnabled()
    expect(screen.getByRole('alert')).toHaveTextContent('O preenchimento foi mantido')
  })
  it('does not navigate or submit while the existing action is busy', () => {
    const saved = vi.fn()
    render(<Example saved={saved} busy />)
    fireEvent.submit(screen.getByLabelText(/Nome/).closest('form'))
    expect(saved).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled()
  })
  it('does not remount fields, erase files or reset local input state when an API error appears', () => {
    function FailingForm() {
      const [error, setError] = useState('')
      return <GuidedForm onSubmit={() => setError('Não foi possível salvar (referência: teste)')}>
        {error ? <div className="alert alert-error">{error}</div> : null}
        <label>Arquivo<input type="file" aria-label="Arquivo" /></label>
        <label>Rascunho<input aria-label="Rascunho" /></label>
        <div className="actions-inline"><button type="submit">Enviar</button></div>
      </GuidedForm>
    }
    render(<FailingForm />)
    const input = screen.getByLabelText('Arquivo')
    const file = new File(['teste'], 'evidencia.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })
    fireEvent.change(screen.getByLabelText('Rascunho'), { target: { value: 'Continuar daqui' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    expect(screen.getByRole('alert')).toHaveTextContent('referência: teste')
    expect(screen.getByLabelText('Arquivo')).toBe(input)
    expect(input.files[0]).toBe(file)
    expect(screen.getByLabelText('Rascunho')).toHaveValue('Continuar daqui')
  })
  it('includes existing non-native requirements and takes the user back to their stage', () => {
    const saved = vi.fn()
    render(<GuidedForm onSubmit={saved}><FormSection title="Veículos" requirement={{ valid: false, message: 'Selecione pelo menos um veículo.' }}><label><input type="checkbox" />Veículo de teste</label></FormSection><FormSection title="Revisão"><p>Conferência</p></FormSection><div className="actions-inline"><button type="submit">Salvar</button></div></GuidedForm>)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '1')
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Selecione pelo menos um veículo')
    expect(saved).not.toHaveBeenCalled()
  })
  it('preserves exact accessible labels for custom money controls and validates selected files', () => {
    const saved = vi.fn()
    render(<GuidedForm onSubmit={saved}><label htmlFor="value">Valor em reais</label><MoneyInput id="value" required value="12.34" /><label>Comprovante<input type="file" required aria-label="Comprovante" /></label><div className="actions-inline"><button type="submit">Registrar</button></div></GuidedForm>)
    expect(screen.getByLabelText('Valor em reais')).toHaveValue('R$ 12,34')
    fireEvent.change(screen.getByLabelText('Comprovante'), { target: { files: [new File(['fictício'], 'teste.png', { type: 'image/png' })] } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }))
    expect(saved).toHaveBeenCalledTimes(1)
  })
  it('does not restore the old controlled select value between native input and change events', async () => {
    function Selection() {
      const [value, setValue] = useState('')
      return <GuidedForm><label>Destino<select required value={value} onChange={(e) => setValue(e.target.value)}><option value="">Selecione</option><option value="one">Primeiro</option></select></label></GuidedForm>
    }
    render(<Selection />)
    await userEvent.selectOptions(screen.getByLabelText('Destino'), 'one')
    expect(screen.getByLabelText('Destino')).toHaveValue('one')
    await waitFor(() => expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1'))
  })
  it('preserves fragment identities and never leaves duplicate controls after conditional updates', () => {
    function Conditional() {
      const [checking, setChecking] = useState(false)
      return <GuidedForm>
        <>{checking ? <p>Conferindo dados</p> : null}<div><button type="button" disabled={checking}>Atualizar verificação</button></div></>
        <><label>Documento<input aria-label="Documento" /></label><button type="button" onClick={() => setChecking((old) => !old)}>Alternar</button></>
      </GuidedForm>
    }
    render(<Conditional />)
    const input = screen.getByLabelText('Documento')
    fireEvent.change(input, { target: { value: 'Rascunho' } })
    fireEvent.click(screen.getByRole('button', { name: 'Alternar' }))
    expect(screen.getAllByRole('button', { name: 'Atualizar verificação' })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Atualizar verificação' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Alternar' }))
    expect(screen.getAllByRole('button', { name: 'Atualizar verificação' })).toHaveLength(1)
    expect(screen.getByLabelText('Documento')).toBe(input)
    expect(input).toHaveValue('Rascunho')
  })
  it('keeps disabled dependent selectors pending and marks their sibling labels as required', async () => {
    render(<GuidedForm><FormSection title="Lotação"><label>Órgão<input aria-label="Órgão" /></label><div className="form-field"><label>Lotação final</label><SearchableSelect required disabled options={[]} value="" /></div></FormSection><div className="actions-inline"><button type="submit">Salvar</button></div></GuidedForm>)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '1')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
    expect(screen.getByRole('button', { name: 'Lotação final' })).toHaveAttribute('aria-required', 'true')
    expect(screen.getByText((_, element) => element.tagName === 'LABEL' && element.textContent.includes('Lotação final'))).toHaveTextContent('*')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Lotação final')
    await waitFor(() => expect(screen.getByLabelText('Órgão')).toHaveFocus())
  })
})
