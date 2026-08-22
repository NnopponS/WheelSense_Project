#include "ws_mailbox.h"

#include <assert.h>
#include <string.h>

int main(void)
{
    uint8_t slot[WS_MAILBOX_SIZE] = {0};
    const ws_mailbox_field_t fields[] = {
        {WS_FIELD_EVENT, "task_confirmed"},
        {WS_FIELD_TASK_ID, "42"},
    };
    assert(ws_mailbox_write(slot, 7, 5, fields, 2) == 0);

    ws_mailbox_view_t view;
    assert(ws_mailbox_read(slot, 0, &view) == 1);
    assert(view.sequence == 7 && view.command == 5);
    char value[32];
    assert(ws_mailbox_find(&view, WS_FIELD_EVENT, value, sizeof(value)) == 1);
    assert(strcmp(value, "task_confirmed") == 0);
    assert(ws_mailbox_read(slot, 7, &view) == 0);

    slot[WS_MAILBOX_HEADER_SIZE] ^= 1;
    assert(ws_mailbox_read(slot, 0, &view) == -1);
    return 0;
}
