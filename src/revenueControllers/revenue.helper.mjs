export const getTodayRange = () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date();
    end.setHours(23, 59, 59, 999);

    return { start, end };
};

export const getCurrentMonthRange = () => {
    const now = new Date();

    const start = new Date(
        now.getFullYear(),
        now.getMonth(),
        1,
    );

    const end = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
        23,
        59,
        59,
        999,
    );

    return { start, end };
};

export const getCurrentYearRange = () => {
    const now = new Date();

    const start = new Date(now.getFullYear(), 0, 1);

    const end = new Date(
        now.getFullYear(),
        11,
        31,
        23,
        59,
        59,
        999,
    );

    return { start, end };
};

export const getLast30Days = () => {
    const end = new Date();

    const start = new Date();

    start.setDate(start.getDate() - 29);

    start.setHours(0, 0, 0, 0);

    return { start, end };
};

export const getLast12Months = () => {
    const now = new Date();

    return Array.from({ length: 12 }, (_, index) => {
        const date = new Date(
            now.getFullYear(),
            now.getMonth() - (11 - index),
            1,
        );

        return {
            year: date.getFullYear(),
            month: date.getMonth(),
        };
    });
};