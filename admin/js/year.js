const params = new URLSearchParams(window.location.search);
const year = Number(params.get("year"));

async function loadSongs() {

    const songList = document.getElementById("songList");

    if (!Number.isInteger(year) || year < 2007 || year > 2025) {
        songList.textContent = "指定された年度が正しくありません。";
        return;
    }

    document.getElementById("yearTitle").textContent = `${year}年`;
    document.title = `${year}年の楽曲一覧`;

    try {

        const response = await fetch(
            `../vocaloid_data/songs_${year}.json`
        );

        if (!response.ok) {
            throw new Error("JSONの読み込みに失敗しました");
        }

        const songs = await response.json();

        // selected: true の曲だけ取得
        const selectedSongs = songs
            .filter(song => song.selected === true)
            .sort((a, b) => a.id - b.id);

        // 曲数表示
        document.getElementById("yearCount").textContent =
            selectedSongs.length;

        songList.innerHTML = "";

        if (selectedSongs.length === 0) {
            songList.textContent = "選択中の楽曲はありません。";
            return;
        }

        selectedSongs.forEach(song => {

            const card = document.createElement("article");
            card.className = "song-card";

            const thumbnail = song.thumbnailUrl
                ? `<img
                    src="${escapeHTML(song.thumbnailUrl)}"
                    alt="${escapeHTML(song.title)}"
                    loading="lazy"
                    onerror="this.style.display='none'"
                   >`
                : `<div class="no-thumbnail">画像なし</div>`;

            const artists = Array.isArray(song.artists)
                ? song.artists.join("、")
                : song.artists || "未登録";

            const producers = Array.isArray(song.producers)
                ? song.producers.join("、")
                : song.producers || "未登録";

            card.innerHTML = `
                <div class="thumbnail">
                    ${thumbnail}
                </div>

                <div class="song-info">

                    <h3>${escapeHTML(song.title || "タイトル不明")}</h3>

                    <div class="info-row">
                        <span class="info-label">Vocal</span>
                        <span>${escapeHTML(artists)}</span>
                    </div>

                    <div class="info-row">
                        <span class="info-label">Producer</span>
                        <span>${escapeHTML(producers)}</span>
                    </div>

                    <div class="info-row">
                        <span class="info-label">YouTube</span>
                        <span>
                            ${song.youtubeUrl
                                ? `<a href="${escapeHTML(song.youtubeUrl)}" target="_blank" rel="noopener noreferrer">動画を開く</a>`
                                : "未登録"}
                        </span>
                    </div>

                        <div class="info-row">
                            <span class="info-label">ニコニコ動画</span>
                            <span>
                                ${song.niconicoUrl
                                    ? `<a href="${escapeHTML(song.niconicoUrl)}" target="_blank" rel="noopener noreferrer">動画を開く</a>`
                                    : "未登録"}
                            </span>
                        </div>

                    <div class="info-row">
                        <span class="info-label">管理ID</span>
                        <span>${escapeHTML(String(song.id))}</span>
                    </div>

                </div>
            `;

            songList.appendChild(card);

        });

    } catch (error) {

        console.error(error);
        songList.textContent = "楽曲データの読み込みに失敗しました。";

    }
}

// HTMLとして解釈されないように文字列をエスケープ
function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

loadSongs();