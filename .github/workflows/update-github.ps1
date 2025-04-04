# --- НАСТРОЙКИ ---
# ОБЯЗАТЕЛЬНО: Укажите ПОЛНЫЙ путь к вашей локальной папке Git-репозитория
$RepoPath = "C:\Users\User\my-retro-audio-site"

# Ветка, в которую вы хотите отправлять изменения (обычно 'main' или 'master')
$TargetBranch = "main"

# Имя удаленного репозитория (обычно 'origin')
$RemoteName = "origin"

# Сообщение для коммита (можно настроить)
# $(Get-Date) добавит текущую дату и время
$CommitMessage = "Автоматическое обновление файлов $(Get-Date)"

# --- НАЧАЛО СКРИПТА ---
Write-Host "Запуск скрипта обновления для репозитория: $RepoPath" -ForegroundColor Cyan

# Проверка существования папки
if (-not (Test-Path -Path $RepoPath -PathType Container)) {
    Write-Error "Ошибка: Путь к репозиторию '$RepoPath' не найден!"
    Exit 1
}

# Проверка наличия Git
$gitExists = Get-Command git -ErrorAction SilentlyContinue
if (-not $gitExists) {
    Write-Error "Ошибка: Команда 'git' не найдена. Установите Git и проверьте PATH."
    Exit 1
}

# Основная логика в блоке try/catch для перехвата ошибок Git
try {
    # Переходим в директорию репозитория
    Push-Location $RepoPath
    Write-Host "1. Перешли в директорию: $(Get-Location)"

    # Добавляем ВСЕ изменения (новые, измененные, удаленные файлы) в индекс
    Write-Host "2. Индексируем все изменения (git add .)..."
    git add .
    # Можно добавить проверку $LASTEXITCODE здесь, если нужно

    # Проверяем, есть ли что коммитить
    # git status --porcelain выведет список измененных файлов, если они есть
    $status = git status --porcelain
    if ($status) {
        Write-Host "3. Обнаружены изменения. Создаем коммит..."
        git commit -m "$CommitMessage"
        if ($LASTEXITCODE -ne 0) { throw "Ошибка во время выполнения git commit." }
        Write-Host "   Коммит создан с сообщением: '$CommitMessage'"

        # Отправляем изменения на GitHub
        Write-Host "4. Отправляем изменения на $RemoteName/$TargetBranch (git push)..."
        git push $RemoteName $TargetBranch
        if ($LASTEXITCODE -ne 0) { throw "Ошибка во время выполнения git push. Проверьте аутентификацию и соединение." }
        Write-Host "   Изменения успешно отправлены на GitHub!" -ForegroundColor Green

    } else {
        Write-Host "3. Нет изменений для коммита. Пропускаем отправку." -ForegroundColor Yellow
    }

} catch {
    # Выводим сообщение об ошибке
    Write-Error "Произошла ошибка: $($_.Exception.Message)"
} finally {
    # Возвращаемся в исходную директорию, даже если была ошибка
    Pop-Location
    Write-Host "5. Скрипт завершен. Вернулись в исходную директорию."
}