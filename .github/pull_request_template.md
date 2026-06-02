## Що змінено

Коротко опиши зміну та її вплив.

## Security Checklist

- [ ] Офіційне оцінювання лишається тільки на backend.
- [ ] Публічні та demo-відповіді не містять ключів олімпіадних відповідей.
- [ ] Роль і статус учителя беруться з БД через `/api/teacher/me`, а не з JWT claims.
- [ ] Нові ID у params/body/query валідовані як UUID до звернення до БД.
- [ ] Rate-limit не послаблено; `trustProxy` не змінено на `true`.
- [ ] Нові frontend HTTP-запити додані через `features/api/client.ts`.
- [ ] Не додано секретів, приватних даних учнів або прямих запитів frontend до таблиць Supabase.
- [ ] Запущено `npm run typecheck`, `npm test`, `npm run build`.
- [ ] Запущено `cd backend && npm run build && npm test`.
- [ ] Для змін Render або Supabase виконано ручний checklist із `docs/security-model.md`.
