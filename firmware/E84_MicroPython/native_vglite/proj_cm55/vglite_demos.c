/*******************************************************************************
* File Name        : vglite_demos.c
*
* Description      : This file contains the implementation of various demos 
*                    using the VG Lite graphics library. It includes event 
*                    handling, drawing functions.
*
* Related Document : See README.md
*
********************************************************************************
* (c) 2025-2026, Infineon Technologies AG, or an affiliate of Infineon
* Technologies AG. All rights reserved.
* This software, associated documentation and materials ("Software") is
* owned by Infineon Technologies AG or one of its affiliates ("Infineon")
* and is protected by and subject to worldwide patent protection, worldwide
* copyright laws, and international treaty provisions. Therefore, you may use
* this Software only as provided in the license agreement accompanying the
* software package from which you obtained this Software. If no license
* agreement applies, then any use, reproduction, modification, translation, or
* compilation of this Software is prohibited without the express written
* permission of Infineon.
*
* Disclaimer: UNLESS OTHERWISE EXPRESSLY AGREED WITH INFINEON, THIS SOFTWARE
* IS PROVIDED AS-IS, WITH NO WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
* INCLUDING, BUT NOT LIMITED TO, ALL WARRANTIES OF NON-INFRINGEMENT OF
* THIRD-PARTY RIGHTS AND IMPLIED WARRANTIES SUCH AS WARRANTIES OF FITNESS FOR A
* SPECIFIC USE/PURPOSE OR MERCHANTABILITY.
* Infineon reserves the right to make changes to the Software without notice.
* You are responsible for properly designing, programming, and testing the
* functionality and safety of your intended application of the Software, as
* well as complying with any legal requirements related to its use. Infineon
* does not guarantee that the Software will be free from intrusion, data theft
* or loss, or other breaches ("Security Breaches"), and Infineon shall have
* no liability arising out of any Security Breaches. Unless otherwise
* explicitly approved by Infineon, the Software may not be used in any
* application where a failure of the Product or any consequences of the use
* thereof can reasonably be expected to result in personal injury.
*******************************************************************************/


#include "vglite_demos.h"
#include "vg_lite_platform.h"
#include "cyabs_rtos.h"
#include "cyabs_rtos_impl.h"
#include "icon/facial_rec.h"
#include "icon/game_control.h"
#include "icon/vision.h"
#include "icon/wearable.h"
#include "infineon_logo_paths.h"
#include "infineon_logo.h"
#include "shape_paths.h"
#include "retarget_io_init.h"

/*******************************************************************************
* Macros
*******************************************************************************/
#define SCREEN_WIDTH                        ( 800 )
#define SCREEN_HEIGHT                       ( 480 )
#define SCREEN_HALF_WIDTH                   ( SCREEN_WIDTH/2 )
#define SCREEN_HALF_HEIGHT                  ( SCREEN_HEIGHT/2 )
#define ICON_COUNT                          ( 4 )
#define ICON_SIZE                           ( 176 )
#define GRID_COLS                           ( 2 )
#define GRID_ROWS                           ( 2 )
#define GRID_0_X_OFFSET                     ( 0 )
#define GRID_0_Y_OFFSET                     ( 0 )
#define ZOOM_OUT_X_SCALE                    ( 1.25f )
#define ZOOM_OUT_Y_SCALE                    ( 1.25f )
#define ZOOM_IN_X_SCALE                     ( 0.8f )
#define ZOOM_IN_Y_SCALE                     ( 0.8f )
#define SCALING_LIMIT                       ( 5 )
#define ROTATION_DEG                        ( 5.0f )
#define BYTE_ALIGNMENT_MASK_64              ( 0x3FU )
#define X_OFFSET_0                          ( 0 )
#define Y_OFFSET_0                          ( 0 )
#define ZOOM_SCALE_0_25                     ( 0.25f )
#define ZOOM_SCALE_2_00                     ( 2.00f )
#define ZOOM_SCALE_1_00                     ( 1.00f )
#define ZOOM_SCALE_1_50                     ( 1.50f )
#define LOGO_WIDTH                          ( ( SCREEN_HALF_WIDTH ) - 150 )
#define LOGO_HEIGHT                         ( ( SCREEN_HALF_HEIGHT ) - 100 )
#define LOGO_START_X_POS                    ( 0 )
#define LOGO_START_Y_POS                    ( 75 )
#define BOX_X_OFFSET                        ( 100 )
#define BOX_Y_OFFSET                        ( 120 )
#define MAIN_MATRIX_X_OFFSET                ( 100 )
#define MAIN_MATRIX_Y_OFFSET                ( 80 )
#define TRIANGLE_Y_ADJUSTMENT_BOX           ( 120 )
#define TRIANGLE_Y_ADJUSTMENT_MAIN_MATRIX   ( 60 )


/*******************************************************************************
* Global Variables
*******************************************************************************/

bool zoom_out              = false;
int scale_count            = RESET_VAL;
uint32_t color_data[] =
{
    0xff4018ec, /* path_data0 : blue */   
    0xffb36600, /* path_data1 : red */   
};
vg_lite_buffer_t image_buffer;

static vg_lite_buffer_t        icons[ICON_COUNT];

/* Lookup table for cleanup sequences */
static vg_lite_path_t* const cleanup_table[EVENT_MAX][EXIT_MAX][4] = {
    /* EVENT_DEFAULT */
    {
        { NULL },                               /* EXIT_0 */
        { &path[0], NULL },                     /* EXIT_1 */
        { &path[0], &path[1], NULL },           /* EXIT_2 */
        { NULL },                               /* EXIT_3 */
        { NULL }                                /* EXIT_4 */
    },
    /* EVENT_FILL_RULES */
    {
        { NULL },
        { &polygon_path, NULL },
        { &polygon_path, &overlapping_squares_path, NULL },
        { NULL },
        { NULL }
    },
    /* EVENT_ALPHA_BEHAVIOR */
    {
        { NULL },
        { &self_intersecting_star_path, NULL },
        { &self_intersecting_star_path, &concentric_circles_path, NULL },
        { NULL },
        { NULL }
    },
    /* EVENT_BLIT_COLOR (same as EVENT_DEFAULT) */
    {
        { NULL },
        { &path[0], NULL },
        { &path[0], &path[1], NULL },
        { NULL },
        { NULL }
    },
    /* EVENT_PATTERN_FILL */
    {
        { NULL },
        { &square_path, NULL },
        { &square_path, &pentagon_path, NULL },
        { &square_path, &pentagon_path, &triangle_path, NULL },
        { &square_path, &pentagon_path, &triangle_path, &hexagon_path }
    },
    /* EVENT_UI_FILTER */
    {
        { NULL },
        { &highlight_path, NULL },
        { NULL },
        { NULL },
        { NULL }
    }
};



/*******************************************************************************
* Function Name: setup_vglite_image_buffer
********************************************************************************
* Summary:
*  -Sets up a vg_lite_buffer_t with image data and properties.
*
* Parameters:
*  buffer      - Pointer to vg_lite_buffer_t to initialize
*  imm_array   - Pointer to image data
*  width       - Image width
*  height      - Image height
*  stride      - Image stride
*  format      - Buffer format
*
* Return:
*  bool         - true on success, false on error
*
*******************************************************************************/
bool setup_vglite_image_buffer(vg_lite_buffer_t *buffer, uint8_t *imm_array, 
                                int32_t width, int32_t height, 
                                int32_t stride, vg_lite_buffer_format_t format)
{
    bool result = true;

    if (((uint32_t)imm_array & BYTE_ALIGNMENT_MASK_64) != 0U)
    {
        printf("Image is not aligned at 64 bytes \r\n");
        result = false;
    }
    else
    {
        /* Get width, height, stride and format info */
        buffer->width  = width;
        buffer->height = height;
        buffer->stride = stride;
        buffer->format = format;

        /* Assign image data into the buffer */
        buffer->handle  = NULL;
        buffer->memory  = imm_array;
        buffer->address = (uint32_t)imm_array;
    }

    return result;
}

/*******************************************************************************
* Function Name: load_images
********************************************************************************
* Summary:
*  -Loads icon images into the icons buffer array.
*
* Parameters:
*  void
*
* Return:
*  bool         - 0 on success, -1 on error
*
*******************************************************************************/
bool load_images(void)
{
    bool result = true;

    /* Load the icons */
    if (setup_vglite_image_buffer(&icons[0], (uint8_t *)&Facial_Rec_map[0],
                                  FACIAL_WIDTH, FACIAL_HEIGHT, FACIAL_STRIDE,
                                  VG_LITE_ARGB8888) == false)
    {
        printf("Load img1 file error \r\n");
        result = false;
    }
    else if (setup_vglite_image_buffer(&icons[1], (uint8_t *)&Game_control_map[0],
                                       GAME_WIDTH, GAME_HEIGHT, GAME_STRIDE,
                                       VG_LITE_ARGB8888) == false)
    {
        printf("Load img2 file error \r\n");
        result = false;
    }
    else if (setup_vglite_image_buffer(&icons[2], (uint8_t *)&vision_map[0],
                                       VISION_WIDTH, VISION_HEIGHT, VISION_STRIDE,
                                       VG_LITE_ARGB8888) == false)
    {
        printf("Load img3 file error \r\n");
        result = false;
    }
    else if (setup_vglite_image_buffer(&icons[3], (uint8_t *)&wearable_map[0],
                                       WEARABLE_WIDTH, WEARABLE_HEIGHT, WEARABLE_STRIDE,
                                       VG_LITE_ARGB8888) == false)
    {
        printf("Load img4 file error \r\n");
        result = false;
    }
    else if (setup_vglite_image_buffer(&image_buffer, (uint8_t *)&infineon_logo_img,
                                       IMG_WIDTH, IMG_HEIGHT, IMG_STRIDE, IMG_FORMAT) == false)
    {
        printf("Could not load image\r\n");
        result = false;
    }
    else
    {
        /* All images loaded successfully */
        result = true;
    }

    return result;
}


/*******************************************************************************
* Function Name: FillRules_draw
********************************************************************************
* Summary:
*  -This function draws the image using GPU and refreshes the frame buffer.
*  -It uses the VG_LITE_FILL_NON_ZERO fill rule to render the Infineon logo.
*     
* Parameters:
*  void
*
* Return:
*  void
*
*******************************************************************************/
void fill_rules_draw(void)
{
    uint8_t exit_id = EXIT_0;
    vg_lite_error_t error = VG_LITE_SUCCESS;
    vg_lite_matrix_t fill_matrix;

    do
    {
        vg_lite_identity(&fill_matrix);
        vg_lite_translate(X_OFFSET_0, Y_OFFSET_0, &fill_matrix);
        
        /* Draw the path using the matrix. */
        error = vg_lite_clear(render_target, NULL, WHITE_COLOR);
        if (error)
        {
            printf("Clear failed: vg_lite_clear() returned error %d\r\n", error);
            break;
        }

        exit_id = EXIT_1;
        /* Draw polygon path (top-left) */
        vg_lite_identity(&matrix);
        vg_lite_translate(X_OFFSET_0, Y_OFFSET_0, &matrix);
        error = vg_lite_draw(render_target, &polygon_path, VG_LITE_FILL_EVEN_ODD,
            &matrix, VG_LITE_BLEND_NONE, TEAL_COLOR);
        if (error) 
        {
            printf("vg_lite_draw() returned error %d\r\n", error);
            break;
        }

        /* Draw self-intersecting star path (top-right) */
        vg_lite_identity(&matrix);
        vg_lite_translate(SCREEN_HALF_WIDTH, Y_OFFSET_0, &matrix);
        error = vg_lite_draw( render_target, &polygon_path, VG_LITE_FILL_NON_ZERO,
                            &matrix, VG_LITE_BLEND_NONE, TEAL_COLOR );
        if (error) 
        {
            printf("vg_lite_draw() returned error %d\r\n", error);
            break;
        }

        exit_id = EXIT_2;
        /* Draw overlapping squares path (bottom-left) */
        vg_lite_identity(&matrix);
        vg_lite_translate(X_OFFSET_0, SCREEN_HALF_HEIGHT, &matrix);
        error = vg_lite_draw(render_target, &overlapping_squares_path, VG_LITE_FILL_EVEN_ODD,
            &matrix, VG_LITE_BLEND_NONE, TEAL_COLOR);
        if (error) 
        {
            printf("vg_lite_draw() returned error %d\r\n", error);
            break;
        }

        /* Draw concentric circles path (bottom-right) */
        vg_lite_identity(&matrix);
        vg_lite_translate(SCREEN_HALF_WIDTH, SCREEN_HALF_HEIGHT, &matrix);
        error = vg_lite_draw( render_target, &overlapping_squares_path, VG_LITE_FILL_NON_ZERO,
                            &matrix, VG_LITE_BLEND_NONE, TEAL_COLOR );
        if (error) 
        {
            printf("vg_lite_draw() returned error %d\r\n", error);
            break;
        }

        /* Flush command buffer and wait for GPU to complete. */
        error = vg_lite_finish();
        if (error)
        {
            printf("GPU operation failed: vg_lite_finish() returned error %d\r\n", error);
            break;
        }
        swap_frame_buffer();

    }while(false);

    if (error)
    {
        cleanup(EVENT_FILL_RULES,exit_id);
    }
    
}

/*******************************************************************************
* Function Name: AlphaBehavior_draw
********************************************************************************
* Summary:
*  -This function draws the image using GPU and refreshes the frame buffer.
*  -It uses the VG_LITE_FILL_EVEN_ODD fill rule and VG_LITE_BLEND_SRC_OVER
*
* Parameters:
*  void
*
* Return:
*  void
*
*******************************************************************************/
void alpha_behavior_draw(void)
{
    uint8_t exit_id = EXIT_0;
    vg_lite_error_t error = VG_LITE_SUCCESS;
    vg_lite_matrix_t draw_matrix;

    do
    {
        vg_lite_identity(&draw_matrix);
        vg_lite_translate(X_OFFSET_0, Y_OFFSET_0, &draw_matrix);
        
        /* Draw the path using the matrix. */
        error = vg_lite_clear(render_target, NULL, 0x80808080 );
        if (error)
        {
            printf("Clear failed: vg_lite_clear() returned error %d\r\n", error);
            break;
        }

        exit_id = EXIT_1;
        /* Draw polygon path (top-left) */
        vg_lite_identity(&matrix);
        vg_lite_translate(X_OFFSET_0, Y_OFFSET_0, &matrix);
        error = vg_lite_draw(&intermediate_buffer, &self_intersecting_star_path, 
                             VG_LITE_FILL_EVEN_ODD,
                             &draw_matrix, VG_LITE_BLEND_NONE, TEAL_COLOR );
        if (error) 
        {
            printf("vg_lite_draw() returned error %d\r\n", error);
            break;
        }

        error = vg_lite_blit(render_target, &intermediate_buffer, &matrix,
                             VG_LITE_BLEND_SRC_OVER, 0, 
                             VG_LITE_FILTER_POINT );
        if (error) 
        {
            printf("vg_lite_blit() returned error %d\r\n", error);
            break;
        }

        vg_lite_clear(&intermediate_buffer, NULL, WHITE_COLOR);

        /* Draw self-intersecting star path (top-right) */
        vg_lite_identity(&matrix);
        vg_lite_translate(SCREEN_HALF_WIDTH, Y_OFFSET_0, &matrix);
        error = vg_lite_draw(&intermediate_buffer, &self_intersecting_star_path, 
                             VG_LITE_FILL_EVEN_ODD,
                             &draw_matrix, VG_LITE_BLEND_NONE, TEAL_COLOR);
        if (error) 
        {
            printf("vg_lite_draw() returned error %d\r\n", error);
            break;
        }

        error = vg_lite_blit(render_target, &intermediate_buffer, &matrix,
                             VG_LITE_BLEND_MULTIPLY, 0,
                             VG_LITE_FILTER_POINT);
        if (error) 
        {
            printf("vg_lite_blit() returned error %d\r\n", error);
            break;
        }

        exit_id = EXIT_2;
        vg_lite_clear(&intermediate_buffer, NULL, WHITE_COLOR);
        /* Draw overlapping squares path (bottom-left) */
        vg_lite_identity(&matrix);
        vg_lite_translate(X_OFFSET_0, SCREEN_HALF_HEIGHT, &matrix);
        error = vg_lite_draw(&intermediate_buffer, &concentric_circles_path,
                             VG_LITE_FILL_EVEN_ODD,
                             &draw_matrix, VG_LITE_BLEND_NONE, TEAL_COLOR);
        if (error) 
        {
            printf("vg_lite_draw() returned error %d\r\n", error);
            break;
        }

        error = vg_lite_blit(render_target, &intermediate_buffer, &matrix,
                             VG_LITE_BLEND_SRC_OVER, 0, 
                             VG_LITE_FILTER_POINT);
        if (error) 
        {
            printf("vg_lite_blit() returned error %d\r\n", error);
            break;
        }
        vg_lite_clear(&intermediate_buffer, NULL, WHITE_COLOR);

        /* Draw concentric circles path (bottom-right) */
        vg_lite_identity(&matrix);
        vg_lite_translate(SCREEN_HALF_WIDTH, SCREEN_HALF_HEIGHT, &matrix);
        error = vg_lite_draw(&intermediate_buffer, &concentric_circles_path,
                             VG_LITE_FILL_EVEN_ODD,
                             &draw_matrix, VG_LITE_BLEND_NONE, TEAL_COLOR);
        if (error) 
        {
            printf("vg_lite_draw() returned error %d\r\n", error);
            break;
        }

        error = vg_lite_blit(render_target, &intermediate_buffer, &matrix,
                             VG_LITE_BLEND_MULTIPLY, 0,
                             VG_LITE_FILTER_POINT);
        if (error) 
        {
            printf("vg_lite_blit() returned error %d\r\n", error);
            break;
        }
        vg_lite_clear(&intermediate_buffer, NULL, WHITE_COLOR);
        /* Flush command buffer and wait for GPU to complete. */
        error = vg_lite_finish();
        if (error)
        {
            printf("GPU operation failed: vg_lite_finish() returned error %d\r\n", error);
            break;
        }

        swap_frame_buffer();
    }while(false);

    if (error)
    {
        cleanup(EVENT_ALPHA_BEHAVIOR,exit_id);
    }
}

/*******************************************************************************
* Function Name: BlitColor_draw
********************************************************************************
* Summary:
*  -This function draws the image using GPU and refreshes the frame buffer.
*  -It uses the VG_LITE_FILL_EVEN_ODD fill rule and VG_LITE_BLEND_SRC_OVER
*
* Parameters:
*  void
*
* Return:
*  void
*
*******************************************************************************/
void blit_color_draw(void)
{
    uint8_t exit_id = EXIT_0;
    uint8_t count;
    vg_lite_error_t error = VG_LITE_SUCCESS;

    do
    {
        error = vg_lite_clear(render_target, NULL, TEAL_COLOR);
        if (error) 
        {
            printf("Clear failed: vg_lite_clear() returned error %d\r\n", error);
            break;
        }

        error = vg_lite_clear(&intermediate_buffer, NULL, WHITE_COLOR);
        if (error) 
        {
            printf("Clear failed: vg_lite_clear() returned error %d\r\n", error);
            break;
        }

        vg_lite_identity(&matrix);
        float scale = ZOOM_SCALE_0_25;
        vg_lite_scale(scale, scale, &matrix);
        vg_lite_translate(X_OFFSET_0, Y_OFFSET_0, &matrix);

        for (count = 0; count < PATH_COUNT; count++) 
        {
            exit_id++;
            error = vg_lite_draw(&intermediate_buffer, &path[count], 
                                 VG_LITE_FILL_EVEN_ODD,
                                 &matrix, VG_LITE_BLEND_NONE, color_data[count]);
            if (error) 
            {
                printf("vg_lite_draw() returned error %d\r\n", error);
                break;
            }
        }
        
        if (error)
        {
            break;
        }

        vg_lite_int32_t logo_x = LOGO_START_X_POS;  
        vg_lite_int32_t logo_y = LOGO_START_Y_POS;
        vg_lite_int32_t logo_width = LOGO_WIDTH;
        vg_lite_int32_t logo_height = LOGO_HEIGHT;
        
        vg_lite_rectangle_t logo_rect = { logo_x, logo_y, logo_width, logo_height };

        int center_x_off_dest = ((SCREEN_HALF_WIDTH) - logo_width) / 2;
        int center_y_off_dest = ((SCREEN_HEIGHT) - logo_height) / 2;
        int x_offsets_dest[GRID_COLS] = {center_x_off_dest, (SCREEN_HALF_WIDTH)+center_x_off_dest};
        int y_offsets_dest[GRID_COLS] = {center_y_off_dest, center_y_off_dest};

        for (int i = 0; i < GRID_COLS; i++) 
        {
            vg_lite_identity(&matrix);
            vg_lite_translate(x_offsets_dest[i], y_offsets_dest[i], &matrix);

            error = vg_lite_blit_rect( render_target, &intermediate_buffer, &logo_rect, &matrix, 
                                        VG_LITE_BLEND_SRC_OVER, 0, VG_LITE_FILTER_POINT );
            if (error) 
            {
                printf("Blit failed: vg_lite_blit_rect() returned error__ %d\r\n", error);
                break;
            }
        }

        if (error)
        {
            break;
        }
        
        error = vg_lite_finish();
        if (error) 
        {
            printf("GPU operation failed: vg_lite_finish() returned error %d\r\n", error);
            break;
        }

        swap_frame_buffer();
    
    }while(false);    

    if (error)
    {
        cleanup(EVENT_BLIT_COLOR,exit_id);
    }
}


/*******************************************************************************
* Function Name: filter_draw
********************************************************************************
* Summary:
*  -This function draws the image using GPU and refreshes the frame buffer.
*  -It uses the VG_LITE_FILL_EVEN_ODD fill rule and VG_LITE_BLEND_SRC_OVER
*
* Parameters:
*  void
*
* Return:
*  void
*
*******************************************************************************/
void filter_draw(void)
{
    uint8_t exit_id = EXIT_0;
    uint8_t count;
    vg_lite_matrix_t highlight_matrix;
    int icon_size = 176;
    vg_lite_error_t error = VG_LITE_SUCCESS;

    do
    {
        vg_lite_identity(&matrix);
        vg_lite_translate(X_OFFSET_0, Y_OFFSET_0, &matrix);
        vg_lite_scale(ZOOM_SCALE_0_25, ZOOM_SCALE_0_25, &matrix);

        /* Draw the path using the matrix. */
        error = vg_lite_clear(render_target, NULL, WHITE_COLOR);
        if (error)
        {
            printf("Clear failed: vg_lite_clear() returned error %d\r\n", error);
            break;
        }

        int cell_width = SCREEN_WIDTH / GRID_COLS;
        int cell_height = SCREEN_HEIGHT / GRID_ROWS;

        vg_lite_identity(&highlight_matrix);
        uint8_t highlight_row = GRID_0_X_OFFSET;
        uint8_t highlight_col = GRID_0_Y_OFFSET;

        /* Calculate which icon to highlight based on time */
        uint32_t current_time = get_time_ms();
        uint32_t highlight_period = 5000; // 5 seconds
        uint8_t current_icon = (current_time / highlight_period) % ICON_COUNT;

        /* Compute row and column of highlighted icon */
        highlight_row = current_icon / GRID_COLS;
        highlight_col = current_icon % GRID_COLS;

        /* Center icon in its grid cell */
        int icon_x = highlight_col * cell_width + (cell_width - ICON_SIZE) / 2;
        int icon_y = highlight_row * cell_height + (cell_height - ICON_SIZE) / 2;

        vg_lite_translate(icon_x, icon_y, &highlight_matrix);
        vg_lite_scale(icon_size / (float)HIGHLIGHT_SIZE, icon_size / (float)HIGHLIGHT_SIZE, &highlight_matrix);

        exit_id = EXIT_1;

        /* Draw the path using the matrix */
        error = vg_lite_draw( render_target, &highlight_path, VG_LITE_FILL_EVEN_ODD, &highlight_matrix, 
                                VG_LITE_BLEND_SRC_OVER, 0xFFE5AF71 );
        if (error) {
            printf("vg_lite_draw() returned error %d\r\n", error);
            break;
        }

        /* Draw the 4 icons in a 2x2 grid */
        for (count = 0; count < ICON_COUNT; count++) {
            vg_lite_identity(&matrix);
            
            int row = count / GRID_COLS;
            int col = count % GRID_COLS;

            /* Center icon in its grid cell */
            int icon_x = col * cell_width + (cell_width - ICON_SIZE) / 2;
            int icon_y = row * cell_height + (cell_height - ICON_SIZE) / 2;

            vg_lite_translate(icon_x, icon_y, &matrix);

            /* Draw the icon */
            error = vg_lite_blit( render_target, &icons[count], &matrix, 
                                VG_LITE_BLEND_SRC_OVER, 0, VG_LITE_FILTER_LINEAR );
            if (error) {
                printf("vg_lite_blit() returned error %d\r\n", error);
                break;
            }
        }

        if (error)
        {
            break;
        }

        /* Flush command buffer and wait for GPU to complete. */
        error = vg_lite_finish();
        if (error)
        {
            printf("GPU operation failed: vg_lite_finish() returned error %d\r\n", error);
            break;
        }

        swap_frame_buffer();
    }while(false);
    
    if (error)
    {
        cleanup(EVENT_UI_FILTER,exit_id);
    }

}

/*******************************************************************************
* Function Name: pattern_fill_draw
********************************************************************************
* Summary:
*  -This function draws the image using GPU and refreshes the frame buffer.
*  -It shows the infineon log on 4 different shapes using vg_lite_draw_pattern
*
* Parameters:
*  void
*
* Return:
*  void
*
*******************************************************************************/
void pattern_fill_draw(void)
{
    uint8_t exit_id = EXIT_0;
    vg_lite_error_t error = VG_LITE_SUCCESS;
    vg_lite_matrix_t box_matrix;

    do
    {
        vg_lite_identity(&box_matrix);
        vg_lite_scale(ZOOM_SCALE_2_00, ZOOM_SCALE_1_00, &box_matrix); 

        vg_lite_translate(BOX_X_OFFSET, BOX_Y_OFFSET, &box_matrix);

        vg_lite_identity(&matrix);
        vg_lite_translate( MAIN_MATRIX_X_OFFSET, MAIN_MATRIX_Y_OFFSET, &matrix);

        /* Draw the path using the matrix. */
        error = vg_lite_clear(render_target, NULL, WHITE_COLOR);
        if (error)
        {
            printf("Clear failed: vg_lite_clear() returned error %d\r\n", error);
            break;
        }

        exit_id = EXIT_1;
        error = vg_lite_draw_pattern( render_target, &square_path, VG_LITE_FILL_EVEN_ODD, &box_matrix, &image_buffer, 
                                    &matrix, VG_LITE_BLEND_SRC_OVER, VG_LITE_PATTERN_COLOR, TEAL_COLOR,TEAL_COLOR,
                                    VG_LITE_FILTER_POINT );
        if (error)
        {
            printf("vg_lite_draw_pattern() returned error %d\r\n", error);
            break;
        }

        vg_lite_identity(&box_matrix);
        vg_lite_scale(ZOOM_SCALE_2_00, ZOOM_SCALE_1_00, &box_matrix); 
        vg_lite_translate( BOX_X_OFFSET + ( SCREEN_HALF_WIDTH / 2 ), BOX_Y_OFFSET, &box_matrix);

        vg_lite_identity(&matrix);
        vg_lite_translate( MAIN_MATRIX_X_OFFSET + SCREEN_HALF_WIDTH, MAIN_MATRIX_Y_OFFSET, &matrix);

        exit_id = EXIT_2;
        error = vg_lite_draw_pattern( render_target, &pentagon_path, VG_LITE_FILL_EVEN_ODD, &box_matrix, &image_buffer, 
                                    &matrix, VG_LITE_BLEND_SRC_OVER, VG_LITE_PATTERN_COLOR, TEAL_COLOR,TEAL_COLOR, 
                                    VG_LITE_FILTER_POINT );
        if (error)
        {
            printf("vg_lite_draw_pattern() returned error %d\r\n", error);
            break;
        }

        vg_lite_identity(&box_matrix);
        vg_lite_scale(ZOOM_SCALE_2_00, ZOOM_SCALE_1_50, &box_matrix); 
        vg_lite_translate(BOX_X_OFFSET, (BOX_Y_OFFSET + SCREEN_HALF_HEIGHT - TRIANGLE_Y_ADJUSTMENT_BOX) , &box_matrix);

        vg_lite_identity(&matrix);
        vg_lite_translate( MAIN_MATRIX_X_OFFSET, MAIN_MATRIX_Y_OFFSET + SCREEN_HALF_HEIGHT + 
                            TRIANGLE_Y_ADJUSTMENT_MAIN_MATRIX, &matrix);

        exit_id = EXIT_3;
        error = vg_lite_draw_pattern( render_target, &triangle_path, VG_LITE_FILL_EVEN_ODD, &box_matrix, &image_buffer,
                                    &matrix, VG_LITE_BLEND_SRC_OVER, VG_LITE_PATTERN_COLOR, TEAL_COLOR,TEAL_COLOR, 
                                    VG_LITE_FILTER_POINT );
        if (error)
        {
            printf("vg_lite_draw_pattern() returned error %d\r\n", error);
            break;
        }

        vg_lite_identity(&box_matrix);
        vg_lite_scale(ZOOM_SCALE_2_00, ZOOM_SCALE_1_00, &box_matrix); 
        vg_lite_translate(BOX_X_OFFSET + ( SCREEN_HALF_WIDTH / 2 ), BOX_Y_OFFSET +  SCREEN_HALF_HEIGHT  , &box_matrix);

        vg_lite_identity(&matrix);
        vg_lite_translate(MAIN_MATRIX_X_OFFSET + SCREEN_HALF_WIDTH,MAIN_MATRIX_Y_OFFSET + SCREEN_HALF_HEIGHT, &matrix);

        exit_id = EXIT_4;
        error = vg_lite_draw_pattern( render_target, &hexagon_path, VG_LITE_FILL_EVEN_ODD, &box_matrix, &image_buffer, 
                                    &matrix, VG_LITE_BLEND_SRC_OVER, VG_LITE_PATTERN_COLOR, TEAL_COLOR,TEAL_COLOR, 
                                    VG_LITE_FILTER_POINT );
        if (error)
        {
            printf("vg_lite_draw_pattern() returned error %d\r\n", error);
            break;
        }

        /* Flush command buffer and wait for GPU to complete. */
        error = vg_lite_finish();
        if (error)
        {
            printf("GPU operation failed: vg_lite_finish() returned error %d\r\n", error);
            break;
        }

        swap_frame_buffer();
    }while(false);

    if (error)
    {
        cleanup(EVENT_PATTERN_FILL,exit_id);
    }
}

/*******************************************************************************
* Function Name: animate_image
********************************************************************************
* Summary:
*  This function animates the image while rotating and zooming it in and out.
*
* Parameters:
*  void
*
* Return:
*  void
*
*******************************************************************************/
void animate_image(void)
{
    if (zoom_out)
    {
        vg_lite_scale(ZOOM_OUT_X_SCALE, ZOOM_OUT_Y_SCALE, &matrix);
        if (!(--scale_count))
            zoom_out = false;
    }
    else
    {
        vg_lite_scale(ZOOM_IN_X_SCALE, ZOOM_IN_Y_SCALE, &matrix);
        if (SCALING_LIMIT == ++scale_count)
            zoom_out = true;
    }

    vg_lite_rotate(ROTATION_DEG, &matrix);
}

/*******************************************************************************
* Function Name: default_draw
********************************************************************************
* Summary:
*  This function draws the image using GPU and refreshes the frame buffer.
*
* Parameters:
*  void
*
* Return:
*  void
*
*******************************************************************************/
void default_draw(void)
{
    uint8_t exit_id = EXIT_0;
    uint8_t count;
    vg_lite_error_t error = VG_LITE_SUCCESS;

    do
    {
        /* Draw the path using the matrix. */
        error = vg_lite_clear(render_target, NULL, WHITE_COLOR);
        if (error)
        {
            printf("Clear failed: vg_lite_clear() returned error %d\r\n", error);
            break;
        }

        for (count = 0; count < PATH_COUNT; count++)
        {
            exit_id++;
            error = vg_lite_draw(render_target, &path[count], VG_LITE_FILL_EVEN_ODD,
                                &matrix, VG_LITE_BLEND_NONE, color_data[count]);

            if (error)
            {
                printf("vg_lite_draw() returned error %d\r\n", error);
                break;
            }
        }

        if (error)
        {
            break;
        }

        /* Rotate and zoom in/out the rendered image */
        animate_image();

        /* Flush command buffer and wait for GPU to complete. */
        error = vg_lite_finish();
        if (error)
        {
            printf("GPU operation failed: vg_lite_finish() returned error %d\r\n", error);
            break;
        }

        swap_frame_buffer();
    }while(false);

    if (error)
    {
        cleanup(EVENT_DEFAULT,exit_id);
    }
}

/*******************************************************************************
* Function Name: cleanup
********************************************************************************
* Summary:
*  Cleans up path objects associated with a given demo and exit state.
*  For the specified combination of `demo_id` and `e_id`, this function
*  clears the corresponding vg_lite path objects and releases GPU memory.
*  After all paths are cleared, it deallocates all resources initialized by
*  the vg_lite library.
*
* Parameters:
*  demo_id - The event type identifier. Must be in the range [EVENT_DEFAULT, 
*            EVENT_MAX).
*  e_id    - The exit state identifier. Must be in the range [EXIT_0,
*            EXIT_MAX).
*
* Return:
*  None
*
*******************************************************************************/
void cleanup(event_type_t demo_id, uint8_t e_id)
{

    if ( ( demo_id < EVENT_MAX )  &&  ( e_id < EXIT_MAX ) )
    {
        vg_lite_path_t* const* paths = cleanup_table[demo_id][e_id];
        for (int i = 0; paths && paths[i]; i++) 
        {
            vg_lite_clear_path(paths[i]);
        }
    }
    
    /* Deallocate all the resource and free up all the memory */
    vg_lite_close();

    handle_app_error();

}

/*******************************************************************************
* Function Name: get_time_ms
********************************************************************************
* Summary:
*  This function gets the current time in milliseconds in FreeRTOS environment.
*
* Parameters:
*  void
*
* Return:
*  uint32_t: current time in milliseconds
*
*******************************************************************************/
uint32_t get_time_ms(void)
{
    /* Convert tick count to milliseconds */
    return (uint32_t) (xTaskGetTickCount() * portTICK_PERIOD_MS);
}

/* [] END OF FILE */

