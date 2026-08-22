/*******************************************************************************
* File Name        : infineon_logo_paths.h
*
* Description      : This header file contains vectored data path of an Infineon
*                    logo to be drawn by vglite API(s). 
*
* Related Document : See README.md
*
********************************************************************************
* (c) 2023-2026, Infineon Technologies AG, or an affiliate of Infineon
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
#ifndef __INFINEON_LOGO_PATHS_H__
#define __INFINEON_LOGO_PATHS_H__

#if defined(__cplusplus)
extern "C" {
#endif

#include "vg_lite.h"

/*******************************************************************************
* Macros
*******************************************************************************/
#define LEFT_COORD           ( 0U )
#define TOP_COORD            ( 0U )
#define BOTTOM_COORD         ( 480U )
#define RIGHT_COORD          ( 800U ) 
#define PATH_COUNT           ( 2U )

/*******************************************************************************
* Global Variables
*******************************************************************************/
/* path_data0 arc===========================================*/
int path_data0[] =
{
        3, 305, 372,
        9, 0, 0, -23, 3, -48, 10,
        9, -19, 4, -32, 9, -37, 10,
        5, 0, 0,
        9, -7, 2, -14, 4, -21, 7,
        9, 7, 6, 11, 16, 11, 27,
        9, 5, -2, 11, -4, 17, -7,
        5, 0, 0,
        9, 6, -2, 24, -8, 39, -13,
        9, 18, -6, 44, -14, 44, -14,
        9, 74, -20, 157, -32, 235, -32,
        9, -89, -5, -170, 0, -240, 12,
        3, 709, 281,
        9, -80, 72, -262, 115, -471, 115,
        9, -283, 0, -466, -83, -479, -193,
        9, -4, -41, 27, -81, 81, -115,
        9, -9, -7, -15, -18, -16, -31,
        9, -78, 40, -122, 94, -122, 149,
        9, 0, 121, 216, 224, 538, 219,
        9, 219, -3, 385, -65, 469, -142,
        5, -1, -2,
        0
};

/* path_data1 i===========================================*/
int path_data1[] =
{
        3, 140, 429,
        9, 0, -16, 13, -29, 29, -29,
        9, 16, 0, 29, 13, 29, 29,
        9, 0, 16, -13, 29, -29, 29,
        9, -16, 0, -29, -13, -29, -29,
        2, 156, 651,
        5, 0, -169,
        5, 27, -3,
        5, 0, 173,
        5, -27, 0,

        /* path2 n===========================================*/
        2, 278, 651,
        5, 0, -97,
        9, 0, -11, 0, -15, -3, -18,
        9, -1, -2, -5, -3, -9, -3,
        9, -5, 0, -13, 4, -20, 12,
        5, 0, 106,
        5, -27, 0,
        5, 0, -105,
        9, 0, -17, -2, -26, -3, -34,
        5, 26, -6,
        9, 0, 2, 3, 9, 3, 17,
        9, 7, -8, 20, -16, 32, -16,
        9, 9, 0, 17, 3, 22, 10,
        9, 5, 7, 6, 16, 6, 26,
        5, 0, 110,
        5, -27, 0,

        /* path3 f===========================================*/
        2, 396, 472,
        9, -3, -2, -8, -4, -13, -4,
        9, -6, 0, -11, 6, -11, 17,
        5, 0, 22,
        5, 26, 0,
        5, -5, 24,
        5, -20, 0,
        5, 0, 119,
        5, -28, 0,
        5, 0, -119,
        5, -9, 0,
        5, 0, -24,
        5, 9, 0,
        9, 0, 0, 0, -9, 0, -19,
        9, 0, -21, 7, -32, 13, -38,
        9, 6, -5, 14, -7, 21, -7,
        9, 10, 0, 18, 2, 26, 7,
        5, -7, 21,

        /* path4 i===========================================*/
        2, 419, 651,
        5, 0, -143,
        5, 28, -3,
        5, 0, 146,
        5, -28, 0,
        3, 13, -164,
        9, -10, 0, -18, -8, -18, -18,
        9, 0, -10, 8, -18, 18, -18,
        9, 10, 0, 18, 8, 18, 18,
        9, 0, 10, -8, 18, -18, 18,

        /* path5 n===========================================*/
        2, 543, 651,
        5, 0, -97,
        9, 0, -11, 0, -15, -3, -18,
        9, -1, -2, -5, -3, -9, -3,
        9, -5, 0, -13, 4, -20, 12,
        5, 0, 106,
        5, -27, 0,
        5, 0, -105,
        9, 0, -17, -2, -26, -3, -34,
        5, 26, -6,
        9, 0, 2, 3, 9, 3, 17,
        9, 7, -8, 20, -16, 32, -16,
        9, 9, 0, 17, 3, 22, 10,
        9, 5, 7, 6, 16, 6, 26,
        5, 0, 110,
        5, -27, 0,

        /* path6 e===========================================*/
        2, 660, 538,
        9, -2, -6, -7, -10, -14, -10,
        9, -12, 0, -17, 11, -18, 37,
        5, 35, 0,
        9, 0, -11, 0, -20, -3, -26,
        3, -32, 49,
        5, 0, 2,
        9, 0, 9, 0, 17, 4, 25,
        9, 4, 8, 11, 13, 19, 13,
        9, 10, 0, 18, -5, 27, -14,
        5, 11, 20,
        9, -12, 13, -25, 19, -40, 19,
        9, -32, 0, -51, -28, -51, -75,
        9, 0, -24, 4, -42, 13, -56,
        9, 8, -12, 20, -19, 34, -19,
        9, 13, 0, 24, 5, 31, 15,
        9, 10, 13, 13, 30, 13, 62,
        5, 0, 6,
        5, -64, 0,

        /* path7 o===========================================*/
        2, 758, 529,
        9, -18, 0, -18, 34, -18, 48,
        9, 0, 15, 0, 51, 19, 51,
        9, 18, 0, 18, -36, 18, -51,
        9, 0, -15, 0, -49, -19, -49,
        3, 0, 126,
        9, -38, 0, -48, -40, -48, -76,
        9, 0, -35, 12, -75, 48, -75,
        9, 28, 0, 49, 25, 49, 74,
        9, 0, 36, -12, 76, -49, 76,

        /* path8 n===========================================*/
        2, 891, 651,
        5, 0, -97,
        9, 0, -11, 0, -15, -3, -18,
        9, -1, -2, -5, -3, -9, -3,
        9, -5, 0, -13, 4, -20, 12,
        5, 0, 106,
        5, -27, 0,
        5, 0, -105,
        9, 0, -17, -2, -26, -3, -34,
        5, 26, -6,
        9, 0, 2, 3, 9, 3, 17,
        9, 7, -8, 20, -16, 32, -16,
        9, 9, 0, 17, 3, 22, 10,
        9, 5, 7, 6, 16, 6, 26,
        5, 0, 110,
        5, -27, 0,
        0
};

vg_lite_path_t path[PATH_COUNT] = {
    {
        /* left, top, right, bottom */
        {LEFT_COORD, TOP_COORD, RIGHT_COORD, BOTTOM_COORD},
        VG_LITE_HIGH,       /* High quality: 16x coverage sample anti-aliasing */
        VG_LITE_S32,        /* -2,147,483,648 to 2,147,483,647 coordinate range */
        {0},                /* uploaded */
        sizeof(path_data0), /* path length */
        path_data0,         /* path data */
        1                   /* initially, path is changed for uploaded */
    },
    {
        {LEFT_COORD, TOP_COORD, RIGHT_COORD, BOTTOM_COORD},
        VG_LITE_HIGH,
        VG_LITE_S32,
        {0},
        sizeof(path_data1),
        path_data1,
        1
    }
};

#if defined(__cplusplus)
}
#endif

#endif  /* __INFINEON_LOGO_PATHS_H__ */

/* [] END OF FILE */
