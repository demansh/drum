# DRUM-16

Простая 16-шаговая драм-машина на чистом JS. Все звуки синтезируются через Web Audio API — без сэмплов и сборки.

## Возможности

- 6 дорожек: Kick, Snare, Clap, Hi-Hat, Open Hat, Tom
- BPM 60–200, swing, громкость каждой дорожки
- Крутилки звука у каждого инструмента (⚙): pitch, tone, decay и т.д.
- Clear / Random, сохранение паттерна и звука в `localStorage`
- Share — ссылка с паттерном и настройками звука в URL hash
- Горячие клавиши: `Space` — play/stop, `1`–`6` — проиграть звук

## Локальный запуск

```sh
python3 -m http.server 8000
```

Открыть http://localhost:8000 (ES-модули не работают через `file://`).

## Деплой на GitHub Pages

1. Создать репозиторий и запушить в ветку `main`.
2. Settings → Pages → Source: **GitHub Actions**.
3. Workflow `.github/workflows/pages.yml` задеплоит сайт при каждом пуше в `main`.
