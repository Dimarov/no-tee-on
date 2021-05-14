const { Client } = require("@notionhq/client");
const { Telegraf } = require("telegraf");
const dotenv = require("dotenv");

dotenv.config();

const notion = new Client({ auth: process.env.NOTION_KEY });
const bot = new Telegraf(process.env.BOT_TOKEN);

const DATABASE_ID = process.env.NOTION_DATABASE_ID;

//A JSON Object to hold all tasks in the Notion database
let storedTasks = {};
let chatId = null;

(async () => {
  bot.start(async (ctx) => {
    chatId = ctx.chat.id;
    ctx.replyWithMarkdown(
      "*Хеллоооооооу 🔥.*\n\nТепер я зможу надсилати апдейты з ```Notion``` сюди."
    );
    console.log("Initial task fetching...");
    storedTasks = await getTasksFromDatabase();
    main();
  });
  bot.launch();
})();

function main() {
  findChangesAndSendEmails().catch(console.error);
}

async function findChangesAndSendEmails() {
  console.log("Looking for changes in Notion database...");
  //Get the tasks currently in the database
  const fetchedTasks = await getTasksFromDatabase();

  //Iterate over the current tasks and compare them to tasks in our local store (storedTasks)
  for (const [key, value] of Object.entries(fetchedTasks)) {
    const pageId = key;
    const pageStatus = value.Status;

    //If this task hasn't been seen before
    if (!(pageId in storedTasks)) {
      //Add this task to the local store of all tasks
      console.log("Found new task!");
      storedTasks[pageId] = {
        Status: pageStatus,
      };
    } else {
      //If the current status is different from the status in the local store
      if (pageStatus !== storedTasks[pageId].Status) {
        //Change the local store.
        console.log("Found updated task!");
        let message = `*${value.LastEditedBy}* змінив(ла) статус задачки *${value.Title}*\n\n\`${storedTasks[pageId].Status} → ${value.Status}\``;
        message = message.replace(/([.?+^$[\]\\(){}|-])/g, "\\$1");

        bot.telegram.sendMessage(chatId, message, { parse_mode: "MarkdownV2" });

        storedTasks[pageId] = {
          Status: pageStatus,
        };

        console.log("Status Changed");
      }
    }
  }
  //Run this method every 10 seconds (10000 milliseconds)
  setTimeout(main, 5000);
}

//Get a paginated list of Tasks currently in a the database.
async function getTasksFromDatabase() {
  const tasks = {};

  async function getPageOfTasks(cursor) {
    let requestPayload = "";
    //Create the request payload based on the presense of a start_cursor
    if (cursor == undefined) {
      requestPayload = {
        path: "databases/" + DATABASE_ID + "/query",
        method: "POST",
      };
    } else {
      requestPayload = {
        path: "databases/" + DATABASE_ID + "/query",
        method: "POST",
        body: {
          start_cursor: cursor,
        },
      };
    }

    //While there are more pages left in the query, get pages from the database.
    console.log("Page fetching...");
    const fetchedPages = await notion.request(requestPayload);

    for (const page of fetchedPages.results) {
      if (page.properties.Status) {
        tasks[page.id] = {
          Status: page.properties.Status.select.name,
          Title: page.properties.Name.title[0].text.content,
          LastEditedBy: page.properties["Last Edited By"].last_edited_by.name,
        };
      } else {
        tasks[page.id] = {
          Status: "No Status",
          Title: page.properties.Name.title[0].text.content,
          LastEditedBy: page.properties["Last Edited By"].last_edited_by.name,
        };
      }
    }
    if (fetchedPages.has_more) {
      await getPageOfTasks(fetchedPages.next_cursor);
    }
  }
  await getPageOfTasks();
  return tasks;
}
