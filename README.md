<!-- MAIN -->
<br />
<div align="center">
  <h2 align="center">JavaScript Chess AI</h2>

  <p align="center">
    A Chess AI and Engine that runs entirely client-side with no backend or external dependencies.
  </p>

  You can test it yourself [right here](https://dig0w.github.io/JavaScript-Chess-AI/main.html).
</div>

<!-- INDEX -->
<details>
  <summary>Index</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
    </li>
    <li><a href="#techniques-used">Techniques Used</a></li>
    <li><a href="#possible-future-work">Possible Future Work</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
  </ol>
</details>

<!-- ABOUT -->
## About The Project

After I've done a [Sudoku bot](https://github.com/dig0w/Sudoku-Bot), I've decided I wanted a bigger challenge in the same area, so I started developing this idea.
This project was built as a learning exercise in chess engine design and search optimization, which took around a month and a half, but there's still a lot I would love to add, and experiment.

I used Javascript for the whole thing, creating classes for the engine, the renderer, the AI, and some other small stuff.
This project uses a bunch of techniques to optimize performance like bitboards, zobrist hashes, etc... most of these were added after I completed the first stage of the project.

In the first stage I had made a fully working engine and AI, but it was too slow, so I tried remaking it for optimization, that's when I found the bitboards, and the zobrist hashes.
The stage two, didn't go very well, it was faster but the AI was worse, so I remade it again for a final time.
This new version, stage three, is now capable of doing evaluating roughly 11k nodes per second, this allowed for a much faster and possibly deeper AI.

<p align="right">(<a href="#JavaScript-Chess-AI">back to top</a>)</p>

<!-- TECHNIQUES USED -->
## Techniques Used

- Bitboards
- Zobrist hashing
- Negamax with alpha–beta pruning
- Transposition Tables
- Quiescence Search
- Late Move Reductions
- Killer & History Heuristics
- Delta & Futility Pruning
- Null-move Pruning
- Iterative Deepening


<p align="right">(<a href="#JavaScript-Chess-AI">back to top</a>)</p>

<!-- FUTURE WORK -->
## Possible Future Work

- [ ] Game Phases
- [ ] Static Exchange Evaluation
- [ ] Razoring

<p align="right">(<a href="#JavaScript-Chess-AI">back to top</a>)</p>

<!-- CONTRIBUTING -->
## Contributing

If you have a suggestion that would make this better, please fork the repo and create a pull request. You can also simply open an issue with the tag "enhancement".

<p align="right">(<a href="#JavaScript-Chess-AI">back to top</a>)</p>

<!-- LICENSE -->
## License

Distributed under the MIT License. See `LICENSE` for more information.

<p align="right">(<a href="#JavaScript-Chess-AI">back to top</a>)</p>


**🔗 Project Link:** [github.com/dig0w/JavaScript-Chess-AI](https://github.com/dig0w/JavaScript-Chess-AI)
