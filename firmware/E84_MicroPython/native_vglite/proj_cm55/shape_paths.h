/*******************************************************************************
* File Name        : shape_paths.h
*
* Description      : This header file contains vectored data paths of an 
*                    different shapes to be drawn by vglite API(s). 
*
* Related Document : See README.md
*
********************************************************************************
* (c) 2023-2026, Infineon Technologies AG, or an affiliate of Infineon
* Technologies AG.  SPDX-License-Identifier: Apache-2.0
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*     http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*******************************************************************************/
#ifndef __SHAPE_PATHS_H__
#define __SHAPE_PATHS_H__

#if defined(__cplusplus)
extern "C" {
#endif

#include "vg_lite.h"

/*******************************************************************************
* Macros
*******************************************************************************/

#define HIGHLIGHT_SIZE          ( 200 )
#define HIGHLIGHT_RAD           ( 10 )


/*******************************************************************************
* Global Variables
*******************************************************************************/

int32_t polygon_path_data[] = 
{
    2, 50, 180,         /* (100-50, 85+95) */
    4, 200, 60,         /* (250-50, -35+95) */
    4, 350, 180,        /* (400-50, 85+95) */
    4, 50, 180,       /* back to start */

    2, 50, 60,       /* (100-50, -35+95) */
    4, 350, 60,      /* (400-50, -35+95) */
    4, 200, 180,     /* (250-50, 85+95) */
    4, 50, 60,       /* back to start */

    0,
};

vg_lite_path_t polygon_path = 
{
    {0, 0,                  /* left,top */
    400, 400},              /* right,bottom */
    VG_LITE_HIGH,                   /* quality */
    VG_LITE_S32,                    /* Format of path coordinates */
    {0},                            /* uploaded */
    sizeof(polygon_path_data),      /* path length */
    polygon_path_data,              /* path data */
    1                               /* path changed */
};

int32_t self_intersecting_star[] = 
{
    2, 200, 40,         /* Top point */
    4, 260, 220,        /* Bottom right */
    4, 100, 100,        /* Left */
    4, 300, 100,      /* Right */
    4, 140, 220,     /* Bottom left */
    4, 200, 40,      /* Back to top (close the pentagram) */
    0,                         /* End of path */
};

vg_lite_path_t self_intersecting_star_path = 
{
    {0, 0, 400, 400},   /* bounding box */
    VG_LITE_HIGH,                       /* quality */
    VG_LITE_S32,                        /* format */
    {0},                                /* uploaded */
    sizeof(self_intersecting_star),     /* path length */
    self_intersecting_star,             /* path data */
    1                                   /* path changed */
};

int32_t overlapping_squares[] = 
{
    /* First square - Clockwise (shifted) */
    2, 118, 38,       
    4, 218, 38,       
    4, 218, 138,      
    4, 118, 138,      
    4, 118, 38,       

    /* Second square - Clockwise (shifted) */
    2, 183, 103,      
    4, 283, 103,      
    4, 283, 203,      
    4, 183, 203,      
    4, 183, 103,      

    0, /* End of path */
};

vg_lite_path_t overlapping_squares_path = 
{
    {0, 0, 400, 400},   /* bounding box */
    VG_LITE_HIGH,                       /* quality */
    VG_LITE_S32,                        /* format */
    {0},                                /* uploaded */
    sizeof(overlapping_squares),        /* path length */
    overlapping_squares,                /* path data */
    1                                   /* path changed */
};

int32_t concentric_circles_data_path[] = 
{
    /* Outer circle (Clockwise) */
    2, 200 + 100, 120,              /* MoveTo (Start point) */
    4, 200 + 86, 120 + 50,
    4, 200 + 50, 120 + 86,
    4, 200,     120 + 100,
    4, 200 - 50, 120 + 86,
    4, 200 - 86, 120 + 50,
    4, 200 - 100, 120,
    4, 200 - 86, 120 - 50,
    4, 200 - 50, 120 - 86,
    4, 200,     120 - 100,
    4, 200 + 50, 120 - 86,
    4, 200 + 86, 120 - 50,
    4, 200 + 100, 120,

    /* Inner circle (Counter-Clockwise for hole in Non-Zero rule) */
    2, 200 + 50, 120,             /* MoveTo inner circle */
    4, 200 + 43, 120 - 25,
    4, 200 + 25, 120 - 43,
    4, 200,     120 - 50,
    4, 200 - 25, 120 - 43,
    4, 200 - 43, 120 - 25,
    4, 200 - 50, 120,
    4, 200 - 43, 120 + 25,
    4, 200 - 25, 120 + 43,
    4, 200,     120 + 50,
    4, 200 + 25, 120 + 43,
    4, 200 + 43, 120 + 25,
    4, 200 + 50, 120,

    0, /* End of path */
};

vg_lite_path_t concentric_circles_path = 
{
    {0, 0, 400, 400},
    VG_LITE_HIGH,
    VG_LITE_S32,
    {0},
    sizeof(concentric_circles_data_path),
    concentric_circles_data_path,
    1
};

int16_t triangle_path_data[] = 
{
    VLC_OP_MOVE, 0, -74,
    VLC_OP_LINE_REL, 85, 148,
    VLC_OP_LINE_REL, -170, 0,
    VLC_OP_CLOSE,
    VLC_OP_END
};

vg_lite_path_t triangle_path = 
{
    .format = VG_LITE_S16,
    .path = triangle_path_data,
    .path_length = sizeof(triangle_path_data),
    .quality = VG_LITE_HIGH,
    .bounding_box = {-70, -80, 70, 80}
};

int16_t pentagon_path_data[] = 
{
    VLC_OP_MOVE, 0, -80,
    VLC_OP_LINE, 76, -24,
    VLC_OP_LINE, 47, 64,
    VLC_OP_LINE, -47, 64,
    VLC_OP_LINE, -76, -24,
    VLC_OP_CLOSE,
    VLC_OP_END
};

vg_lite_path_t pentagon_path = 
{
    .format = VG_LITE_S16,
    .path = pentagon_path_data,
    .path_length = sizeof(pentagon_path_data),
    .quality = VG_LITE_HIGH,
    .bounding_box = {-76, -80, 76, 80}
};

int16_t hexagon_path_data[] = 
{
    VLC_OP_MOVE, 80, 0,
    VLC_OP_LINE, 40, 70,
    VLC_OP_LINE, -40, 70,
    VLC_OP_LINE, -80, 0,
    VLC_OP_LINE, -40, -70,
    VLC_OP_LINE, 40, -70,
    VLC_OP_CLOSE,
    VLC_OP_END
};

vg_lite_path_t hexagon_path = 
{
    .format = VG_LITE_S16,
    .path = hexagon_path_data,
    .path_length = sizeof(hexagon_path_data),
    .quality = VG_LITE_HIGH,
    .bounding_box = {-70, -60, 70, 60}
};

/* Rounded rectangle path with original size 200x200 @ (0, 0) */
static int32_t highlight_path_data[] = 
{
    2, HIGHLIGHT_RAD,  0,

    4, HIGHLIGHT_SIZE - HIGHLIGHT_RAD, 0,
    6, HIGHLIGHT_SIZE, 0, HIGHLIGHT_SIZE, HIGHLIGHT_RAD,

    4, HIGHLIGHT_SIZE, HIGHLIGHT_SIZE - HIGHLIGHT_RAD,
    6, HIGHLIGHT_SIZE, HIGHLIGHT_SIZE, HIGHLIGHT_SIZE - HIGHLIGHT_RAD, HIGHLIGHT_SIZE,

    4, HIGHLIGHT_RAD, HIGHLIGHT_SIZE,
    6, 0, HIGHLIGHT_SIZE, 0, HIGHLIGHT_SIZE - HIGHLIGHT_RAD,

    4, 0, HIGHLIGHT_RAD,
    6, 0, 0, HIGHLIGHT_RAD, 0,
    0

};

static vg_lite_path_t highlight_path = 
{
    {0, 0, HIGHLIGHT_SIZE, HIGHLIGHT_SIZE},         /* left,top, right,bottom */
    VG_LITE_HIGH,                                                   /* quality */
    VG_LITE_S32,                                                    /* 0 to 400 coordinate range */
    {0},                                                            /* uploaded */
    sizeof(highlight_path_data),                                    /* path length */
    highlight_path_data,                                            /* path data */
    1
};

int16_t square_path_data[] = 
{
    VLC_OP_MOVE, -80, -80,          /* Top-left */
    VLC_OP_LINE, 80, -80,           /* Top-right */
    VLC_OP_LINE, 80, 80,            /* Bottom-right */
    VLC_OP_LINE, -80, 80,         /* Bottom-left */
    VLC_OP_CLOSE,
    VLC_OP_END
};

vg_lite_path_t square_path = 
{
    .format = VG_LITE_S16,                                  /* format */
    .path = square_path_data,                               /* path data */
    .path_length = sizeof(square_path_data),                /* path length */
    .quality = VG_LITE_HIGH,                                /* quality */
    .bounding_box = {-80, -80, 80, 80}      /* bounding box */
};

#if defined(__cplusplus)
}
#endif

#endif  /* __SHAPE_PATHS_H__ */