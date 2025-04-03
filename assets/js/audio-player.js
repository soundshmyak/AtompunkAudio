document.addEventListener('DOMContentLoaded', function() {
    const audioPlayers = document.querySelectorAll('audio');

    audioPlayers.forEach(audio => {
        audio.controls = false;
        const controls = document.createElement('div');
        controls.classList.add('audio-controls');

        const playButton = document.createElement('button');
        playButton.textContent = 'Play';
        playButton.addEventListener('click', () => {
            if (audio.paused) {
                audio.play();
                playButton.textContent = 'Pause';
            } else {
                audio.pause();
                playButton.textContent = 'Play';
            }
        });
        controls.appendChild(playButton);

        audio.parentNode.insertBefore(controls, audio);
    });
});