const START_YEAR = 2007;
const END_YEAR = 2025;

async function loadData() {

    let totalCount = 0;
    const yearList = document.getElementById("yearList");

    yearList.innerHTML = "";

    for (let year = START_YEAR; year <= END_YEAR; year++) {

        try {

            const response = await fetch(
                `../vocaloid_data/songs_${year}.json`
            );

            if (!response.ok) {
                throw new Error("JSONの読み込みに失敗しました");
            }

            const songs = await response.json();

            const selectedSongs = songs.filter(song => {
                return song.selected === true;
            });

            const count = selectedSongs.length;

            totalCount += count;

            const button = document.createElement("a");

            button.href = `year.html?year=${year}`;
            button.className = "year-card";

            button.innerHTML = `
                <span class="year-number">${year}年</span>
                <span class="year-count">${count}曲</span>
            `;

            yearList.appendChild(button);

        } catch (error) {

            console.error(`${year}年の読み込みエラー:`, error);

            const errorMessage = document.createElement("p");
            errorMessage.textContent = `${year}年：読み込み失敗`;
            yearList.appendChild(errorMessage);

        }
    }

    document.getElementById("totalCount").textContent =
        totalCount.toLocaleString();
}

loadData();