# Supabase Auth email templates

These production templates keep the email action link on `rozumko.com`. The
landing page requires an explicit user action before opening the one-time
Supabase verification URL, which also prevents mail prefetchers from consuming
the token.

## Confirm sign up

Subject: `Підтвердіть email — Розумко`

```html
<h2>Підтвердіть електронну адресу</h2>
<p>Ви створюєте акаунт на освітній платформі «Розумко».</p>
<p><a href="https://rozumko.com/auth-confirm.html?token_hash={{ .TokenHash }}&type=signup&redirect_to={{ .RedirectTo }}">Підтвердити email</a></p>
<p>Якщо ви не створювали акаунт, просто проігноруйте цей лист.</p>
```

## Reset password

Subject: `Зміна пароля — Розумко`

```html
<h2>Зміна пароля</h2>
<p>Ми отримали запит на зміну пароля до вашого акаунта «Розумко».</p>
<p><a href="https://rozumko.com/auth-confirm.html?token_hash={{ .TokenHash }}&type=recovery&redirect_to={{ .RedirectTo }}">Змінити пароль</a></p>
<p>Якщо ви не надсилали цей запит, не переходьте за посиланням.</p>
```

After changing a template, test both teacher and parent redirects. The allowed
targets are exactly `https://rozumko.com/teacher.html` and
`https://rozumko.com/parent.html`.
