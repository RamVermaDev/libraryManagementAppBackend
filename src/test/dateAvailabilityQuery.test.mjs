/**
 * Unit Test Suite for Reservation Date Availability Queries
 * Tests the "start_date < start_of_tomorrow" rule for live seat availability.
 */

function getDayBounds(dateInput = new Date()) {
    const d = new Date(dateInput);
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth();
    const date = d.getUTCDate();

    const startOfToday = new Date(Date.UTC(year, month, date, 0, 0, 0, 0));
    const startOfTomorrow = new Date(Date.UTC(year, month, date + 1, 0, 0, 0, 0));

    return { startOfToday, startOfTomorrow };
}

function isReservationActiveOnDate(reservation, targetDate) {
    const { startOfToday, startOfTomorrow } = getDayBounds(targetDate);
    const start = new Date(reservation.subscriptionStartDate);
    const expiry = new Date(reservation.subscriptionExpiryDate);

    return start < startOfTomorrow && expiry >= startOfToday;
}

function runTests() {
    const targetDate = new Date("2026-07-26T00:00:00.000Z");
    let passedCount = 0;

    // Test 1: Student added today at midnight (2026-07-26 00:00:00)
    const test1 = {
        name: "Student added today at 00:00:00 -> counts as booked today",
        reservation: {
            subscriptionStartDate: "2026-07-26T00:00:00.000Z",
            subscriptionExpiryDate: "2026-08-25T23:59:59.999Z"
        },
        expected: true
    };

    // Test 2: Student added on a past date (2026-07-20)
    const test2 = {
        name: "Student added on past date (2026-07-20) -> counts as booked today",
        reservation: {
            subscriptionStartDate: "2026-07-20T00:00:00.000Z",
            subscriptionExpiryDate: "2026-08-19T23:59:59.999Z"
        },
        expected: true
    };

    // Test 3: Student with a future start date (2026-07-28)
    const test3 = {
        name: "Student with future start date (2026-07-28) -> does NOT count as booked today",
        reservation: {
            subscriptionStartDate: "2026-07-28T00:00:00.000Z",
            subscriptionExpiryDate: "2026-08-27T23:59:59.999Z"
        },
        expected: false
    };

    // Test 4: Student added at the very last moment of the day (23:59:59.999)
    const test4 = {
        name: "Student added at 23:59:59.999 -> counts as booked today",
        reservation: {
            subscriptionStartDate: "2026-07-26T23:59:59.999Z",
            subscriptionExpiryDate: "2026-08-25T23:59:59.999Z"
        },
        expected: true
    };

    const tests = [test1, test2, test3, test4];

    console.log("=== Running Date Availability Query Tests ===");
    for (const t of tests) {
        const result = isReservationActiveOnDate(t.reservation, targetDate);
        if (result === t.expected) {
            console.log(`[PASS] ${t.name}`);
            passedCount++;
        } else {
            console.error(`[FAIL] ${t.name}: expected ${t.expected}, got ${result}`);
        }
    }

    console.log(`\nResults: ${passedCount}/${tests.length} tests passed.`);
    if (passedCount !== tests.length) {
        process.exit(1);
    }
}

runTests();
