import { expect, test } from '@playwright/test'

test('el login no puede hacer submit nativo antes de hidratarse', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()

  await page.goto('/login')
  await expect(page).toHaveURL('/login')
  await expect(page.getByTestId('login-form')).toHaveAttribute('data-hydrated', 'false')
  await expect(page.locator('form')).toHaveCount(0)

  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill('prehydration@example.invalid')
  await page.locator('input#password').fill('Synthetic-Only-Not-A-Real-Password!')

  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).toHaveURL('/login')

  await page.locator('input#password').press('Enter')
  await expect(page).toHaveURL('/login')

  await context.close()
})
