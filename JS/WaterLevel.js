import {
    ref,
    onValue
} from
"https://www.gstatic.com/firebasejs/12.17.0/firebase-database.js";

import {
    database
} from "./auth.js";


// ============================================================
// CONFIGURATION
// ============================================================

const CURRENT_PATH =
    "sensors/UL800";

const HISTORY_PATH =
    "history/UL800";


// ============================================================
// WATER LEVEL THRESHOLDS
// ============================================================
//
// These are in FEET because the website displays feet.
// Change these according to your approved project values.
//

const SAFE_LEVEL = 3.0;

const MONITOR_LEVEL = 5.0;

const WARNING_LEVEL = 7.0;


// ============================================================
// ELEMENTS
// ============================================================

const currentElement =
    document.getElementById(
        "currentWaterLevel"
    );

const highestElement =
    document.getElementById(
        "highestWaterLevel"
    );

const lowestElement =
    document.getElementById(
        "lowestWaterLevel"
    );

const historyElement =
    document.getElementById(
        "waterHistory"
    );


// ============================================================
// CURRENT READING (for history injection)
// ============================================================

let currentReading =
    null;

let lastDailyData =
    null;


// ============================================================
// METERS → FEET
// ============================================================

function metersToFeet(meters)
{
    return (
        Number(meters) *
        3.28084
    );
}


// ============================================================
// FORMAT FEET
// ============================================================

function formatFeet(value)
{
    if (
        value === null ||
        value === undefined ||
        isNaN(value)
    )
    {
        return "-- ft";
    }

    return (
        Number(value).toFixed(2) +
        " ft"
    );
}


// ============================================================
// CURRENT WATER LEVEL
// ============================================================

const currentRef =
    ref(
        database,
        CURRENT_PATH
    );


onValue(
    currentRef,
    snapshot =>
    {
        const data =
            snapshot.val();


        if (!data)
        {
            console.log(
                "No current sensor data."
            );

            if (currentElement)
            {
                currentElement.textContent =
                    "-- ft";
            }

            return;
        }


        // ====================================================
        // LEVEL
        // ====================================================

        const levelMeters =
            Number(
                data.level
            );


        const levelFeet =
            metersToFeet(
                levelMeters
            );


        // ====================================================
        // UPDATE CURRENT LEVEL
        // ====================================================

        if (currentElement)
        {
            currentElement.textContent =
                formatFeet(
                    levelFeet
                );
        }


        // ====================================================
        // STATUS
        // ====================================================

        updateCurrentStatus(
            levelFeet
        );


        // ====================================================
        // STORE FOR HISTORY INJECTION
        // ====================================================

        currentReading =
            {
                average:
                    levelFeet,

                highest:
                    levelFeet,

                lowest:
                    levelFeet,

                date:
                    getTodayDate()
            };


        // ====================================================
        // RE-RENDER HISTORY WITH CURRENT READING
        // ====================================================

        if (
            lastDailyData
        )
        {
            renderHistory(
                lastDailyData
            );
        }


        console.log(
            "Realtime water level:",
            levelFeet,
            "ft"
        );
    }
);


// ============================================================
// HISTORY
// ============================================================

const historyRef =
    ref(
        database,
        HISTORY_PATH
    );


onValue(
    historyRef,
    snapshot =>
    {
        const data =
            snapshot.val();


        if (!data)
        {
            console.log(
                "No history data."
            );


            if (historyElement)
            {
                historyElement.innerHTML =
                    "<div>No water level history available.</div>";
            }


            return;
        }


        const dailyData =
            processHistory(
                data
            );


        // ====================================================
        // STORE FOR CURRENT READING INJECTION
        // ====================================================

        lastDailyData =
            dailyData;


        // ====================================================
        // TODAY
        // ====================================================

        updateTodayStatistics(
            dailyData
        );


        // ====================================================
        // 30 DAYS
        // ====================================================

        renderHistory(
            dailyData
        );
    }
);


// ============================================================
// PROCESS HISTORY
// ============================================================

function processHistory(data)
{
    const dailyData = {};


    Object.entries(
        data
    ).forEach(
        (
            [
                date,
                readings
            ]
        ) =>
        {
            if (!readings)
            {
                return;
            }


            const values = [];


            Object.values(
                readings
            ).forEach(
                reading =>
                {
                    if (
                        !reading ||
                        reading.level ===
                        undefined
                    )
                    {
                        return;
                    }


                    const meters =
                        Number(
                            reading.level
                        );


                    const feet =
                        metersToFeet(
                            meters
                        );


                    values.push(
                        {
                            level:
                                feet,

                            timestamp:
                                Number(
                                    reading.timestamp
                                )
                        }
                    );
                }
            );


            if (
                values.length === 0
            )
            {
                return;
            }


            const validValues =
                values.filter(
                    item =>
                        item.level > 0
                );

            if (
                validValues.length === 0
            )
            {
                return;
            }

            const levels =
                validValues.map(
                    item =>
                        item.level
                );


            const highest =
                Math.max(
                    ...levels
                );


            const lowest =
                Math.min(
                    ...levels
                );


            const average =
                levels.reduce(
                    (
                        sum,
                        value
                    ) =>
                        sum + value,
                    0
                )
                /
                levels.length;


            dailyData[
                date
            ] =
            {
                average:
                    average,

                highest:
                    highest,

                lowest:
                    lowest,

                readings:
                    validValues
            };
        }
    );


    return dailyData;
}


// ============================================================
// TODAY STATISTICS
// ============================================================

function updateTodayStatistics(
    dailyData
)
{
    const today =
        getTodayDate();


    const todayData =
        dailyData[
            today
        ];


    if (!todayData)
    {
        if (highestElement)
        {
            highestElement.textContent =
                "-- ft";
        }


        if (lowestElement)
        {
            lowestElement.textContent =
                "-- ft";
        }


        return;
    }


    if (highestElement)
    {
        highestElement.textContent =
            formatFeet(
                todayData.highest
            );
    }


    if (lowestElement)
    {
        lowestElement.textContent =
            formatFeet(
                todayData.lowest
            );
    }
}


// ============================================================
// TODAY DATE
// ============================================================

function getTodayDate()
{
    const now =
        new Date();


    const year =
        now.getFullYear();


    const month =
        String(
            now.getMonth() + 1
        ).padStart(
            2,
            "0"
        );


    const day =
        String(
            now.getDate()
        ).padStart(
            2,
            "0"
        );


    return (
        `${year}-${month}-${day}`
    );
}


// ============================================================
// RENDER HISTORY
// ============================================================

function renderHistory(
    dailyData
)
{
    if (!historyElement)
    {
        return;
    }


    historyElement.innerHTML =
        "";


    // ========================================================
    // INJECT CURRENT READING AS TODAY'S ENTRY
    // ========================================================

    if (
        currentReading &&
        !dailyData[
            currentReading.date
        ]
    )
    {
        dailyData[
            currentReading.date
        ] =
        {
            average:
                currentReading.average,

            highest:
                currentReading.highest,

            lowest:
                currentReading.lowest,

            readings:
                []
        };
    }


    const dates =
        Object.keys(
            dailyData
        )
        .sort()
        .reverse()
        .slice(
            0,
            30
        );


    if (dates.length === 0)
    {
        historyElement.innerHTML =
            "<div>No history available.</div>";

        return;
    }


    dates.forEach(
        date =>
        {
            const data =
                dailyData[
                    date
                ];


            const status =
                getStatus(
                    data.average
                );


            const icon =
                getStatusIcon(
                    status
                );


            const formattedDate =
                formatDate(
                    date
                );


            const item =
                document.createElement(
                    "div"
                );


            item.className =
                "level-item";


            item.innerHTML = `

                <div class="history-icon">

                    <img
                        src="${icon}"
                        class="svg"
                        alt="${status}"
                    >

                </div>


                <div class="content1">

                    <div class="status">
                        ${status}
                    </div>

                    <div class="date">
                        ${formattedDate}
                    </div>

                </div>


                <div class="ave">

                    <strong>
                        ${data.average.toFixed(2)}
                    </strong>

                    <span>
                        ft
                    </span>

                </div>


                <div class="content2">

                    <div class="desc">
                        Highest :
                        ${data.highest.toFixed(2)} ft
                    </div>

                    <div class="desc">
                        Lowest :
                        ${data.lowest.toFixed(2)} ft
                    </div>

                </div>

            `;


            historyElement.appendChild(
                item
            );
        }
    );
}


// ============================================================
// FORMAT DATE
// ============================================================

function formatDate(
    dateString
)
{
    const date =
        new Date(
            dateString +
            "T00:00:00"
        );


    return date.toLocaleDateString(
        "en-US",
        {
            month:
                "long",

            day:
                "numeric"
        }
    );
}


// ============================================================
// STATUS
// ============================================================

function getStatus(
    level
)
{
    if (
        level <
        SAFE_LEVEL
    )
    {
        return "Safe";
    }


    if (
        level <
        MONITOR_LEVEL
    )
    {
        return "Monitor";
    }


    if (
        level <
        WARNING_LEVEL
    )
    {
        return "Warning";
    }


    return "Critical";
}


// ============================================================
// STATUS ICON
// ============================================================

function getStatusIcon(
    status
)
{
    switch (
        status
    )
    {
        case "Safe":

            return "../Icons/ic_water_1.svg";


        case "Monitor":

            return "../Icons/ic_water_2.svg";


        case "Warning":

            return "../Icons/ic_water_3.svg";


        case "Critical":

            return "../Icons/ic_water_4.svg";


        default:

            return "../Icons/ic_water_1.svg";
    }
}


// ============================================================
// CURRENT STATUS
// ============================================================

function updateCurrentStatus(
    level
)
{
    const status =
        getStatus(
            level
        );


    console.log(
        "Current water status:",
        status
    );
}