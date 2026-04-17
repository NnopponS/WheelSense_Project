# WheelSense (ECE senior project / thesis)

This repository is the **WheelSense** thesis: *Prototyping Development of Smart Environment for Wheelchair User*. The project root is this folder (the former `WheelSense-Thesis` contents now live here).

It is based on the Department of Electrical and Computer Engineering LaTeX report template. Only LaTeX is used for the main document.

## Files you will edit

1. `latex/meta/info.tex`

   - define strings for your project information

2. `latex/thesis.tex`

   - the main file
   - comment/uncomment to
     - change report type (proposal/progress 1/progress 2/final)
     - add appendix

3. `latex/content/chapters/chapter[1-5].tex`

   - individual chapters of your report

4. `latex/content/frontmatter/*.tex`

   - abstracts, acknowledgements, and acronyms

5. `latex/bib/refs.bib`

   - bibliography entries

## Build locally

From the `latex` folder:

```bash
xelatex -interaction=nonstopmode thesis.tex
biber thesis
xelatex -interaction=nonstopmode thesis.tex
xelatex -interaction=nonstopmode thesis.tex
```

### Optional LaTeX style guide (not part of the thesis PDF)

Template examples (lists, figures, tables, citations) live in `latex/doc/latex-writing-guide-chapter.tex` and are built as a separate PDF via `latex/latex-writing-guide.tex`. From the `latex` folder:

```bash
xelatex -interaction=nonstopmode latex-writing-guide.tex
biber latex-writing-guide
xelatex -interaction=nonstopmode latex-writing-guide.tex
xelatex -interaction=nonstopmode latex-writing-guide.tex
```

## Using this template with Overleaf

[Overleaf][overleaf url] is a collaborative cloud-based LaTeX editor used for writing, editing and publishing scientific documents.

To use this template on [Overleaf][overleaf url]:

1. [Download the latest file](https://github.com/tueceproj/reporttemplate/archive/master.zip) as a zip file, or go to [the latest release](https://github.com/tueceproj/reporttemplate/releases/latest) and download the lastest **Source code (zip)** file, to your device.
2. Go to [Overleaf](https://www.overleaf.com/).
   - **Login**
     - Recommend to use Google email account from the Faculty (xxxxxxxxxx@student.tu.ac.th)
   - Or **Register** if you would like to create a new account with [Overleaf][overleaf url].
     - Registration is free.

After login to the web [Overleaf][overleaf url]:

1. Click **New Project**.
   - choose **Upload Project** option.
2. Select to upload the zip file you have downloaded earlier.
   - Wait until the upload process finishes.
   - The main file, **thesis.tex** should be automatically detected. If not, select the file.
   - The web will automatically try to compile the main file, and display some errors after comilation.
3. Click **Menu**.
   - Under **Settings**, change **Compiler** to **XeLaTeX**.
4. Click **Recompile**.
   - This may some time.
   - After compilation is finished, the web will automatically show the resulting PDF file.
   - There may be some warnings after compilation. These warning can be ignored.

[overleaf url]: https://www.overleaf.com/
