/* global ChromeUtils, ExtensionAPI */
const { classes: Cc, interfaces: Ci, utils: Cu } = Components;

var { ExtensionCommon } = ChromeUtils.importESModule("resource://gre/modules/ExtensionCommon.sys.mjs");

// To interact with calendars and items
var cal = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs").cal;

var calendarTasks = class extends ExtensionAPI {
    getAPI(context) {
        return {
            calendarTasks: {
                async getTaskLists() {
                    const manager = Cc["@mozilla.org/calendar/manager;1"].getService(Ci.calICalendarManager);
                    const calendars = manager.getCalendars();

                    let lists = [];
                    for (let calendar of calendars) {
                        // Check if this calendar supports tasks
                        if (calendar.getProperty("capabilities.tasks.supported") !== false) {
                            lists.push({
                                id: calendar.id,
                                name: calendar.name
                            });
                        }
                    }
                    return lists;
                },

                async createTask(listId, title, dueDateStr, notes) {
                    try {
                        const manager = Cc["@mozilla.org/calendar/manager;1"].getService(Ci.calICalendarManager);
                        let targetCalendar = null;

                        for (let cal of manager.getCalendars()) {
                            if (cal.id === listId) {
                                targetCalendar = cal;
                                break;
                            }
                        }

                        if (!targetCalendar) {
                            throw new Error("Target task list not found: " + listId);
                        }

                        // Create a new task item (calITodo)
                        let item = Cc["@mozilla.org/calendar/todo;1"].createInstance(Ci.calITodo);
                        item.title = title || "New Task";

                        if (notes) {
                            item.setProperty("DESCRIPTION", notes);
                        }

                        // Skip due date assignment for now as it throws WrappedNative / JS Conversion errors in TB 128+

                        // Add item to calendar
                        await targetCalendar.addItem(item);
                        return true;

                    } catch (error) {
                        console.error("Experiment API Exception: ", error);
                        throw error;
                    }
                }
            }
        };
    }
};
